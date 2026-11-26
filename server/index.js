import './env.js';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initStore, store } from './store.js';
import { getDb } from './db.js';
import {
  verifyPassword,
  validateStrongPassword,
  signAuthToken,
  verifyAuthToken,
  getPasswordVersion,
  safeEqualStrings,
  sanitizeText,
  sanitizeMultilineText,
  getSessionQrToken,
  validateSessionToken,
  parseCookies,
  signCookieValue,
  verifyCookieValue,
} from './auth.js';
import { getClientIp, getLocalLanIp, haversineDistanceMeters } from './network.js';
import {
  isEmailConfigured,
  sendSignupVerificationEmail,
  sendPasswordResetEmail,
  sendSupportReportEmail,
  sendOwnerSecurityCodeEmail,
} from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_VERCEL = Boolean(process.env.VERCEL);
const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const PORT = Number(process.env.PORT) || 3001;
const DEVICE_COOKIE_NAME = 'attendqr_dev';
const OAUTH_STATE_COOKIE_NAME = 'attendqr_oauth_state';
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

// Exclusive single Owner email lock (configured via .env ONLY — never hardcoded in code)
const RAW_OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(RAW_OWNER_EMAIL) ? RAW_OWNER_EMAIL : '';

const OWNER_GATE_COOKIE_NAME = 'attendqr_owner_gate';
const OWNER_GATE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const OWNER_OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OWNER_OTP_MAX_ATTEMPTS = 5;
const OWNER_OTP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function hashOwnerOtp(code) {
  return crypto.createHash('sha256').update(`owner-otp:${String(code)}`).digest('hex');
}

function isOwnerEmail(email) {
  if (!OWNER_EMAIL) return false;
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return false;
  return safeEqualStrings(clean, OWNER_EMAIL);
}

function getRequestOrigin(req) {
  const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const proto = rawProto === 'https' ? 'https' : 'http';
  const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`)
    .split(',')[0]
    .trim();
  const safeHost = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(rawHost) ? rawHost : `localhost:${PORT}`;
  return `${proto}://${safeHost}`;
}

function parseAllowedRedirectUris() {
  const candidates = [
    ...(process.env.GOOGLE_ALLOWED_REDIRECT_URIS || '').split(','),
    process.env.GOOGLE_REDIRECT_URI || '',
  ]
    .map((u) => u.trim())
    .filter(Boolean);

  const allowlist = new Set();
  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) continue;
      if (parsed.pathname !== '/api/auth/google/callback') continue;
      if (parsed.search || parsed.hash) continue;
      allowlist.add(parsed.origin + parsed.pathname);
    } catch {
      // Ignore malformed env entries
    }
  }

  // Local development convenience fallback ONLY when not in production and no explicit allowlist was set
  if (allowlist.size === 0 && !IS_PRODUCTION) {
    allowlist.add(`http://localhost:${PORT}/api/auth/google/callback`);
  }

  return Array.from(allowlist);
}

const PREAPPROVED_GOOGLE_REDIRECTS = parseAllowedRedirectUris();
const PREAPPROVED_GOOGLE_REDIRECT_SET = new Set(PREAPPROVED_GOOGLE_REDIRECTS);

const UNTRUSTED_REDIRECT_QUERY_KEYS = [
  'redirect_uri',
  'redirect',
  'redirect_url',
  'return_to',
  'returnTo',
  'next',
  'callback',
  'continue',
  'url',
];

function getGoogleOAuthConfig(req) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const hasAllowlist = PREAPPROVED_GOOGLE_REDIRECTS.length > 0;

  let redirectUri = null;
  let rejectedReason = null;

  if (req && hasAllowlist) {
    // 1. NEVER trust redirect URLs passed in query parameters; reject any unapproved redirect attempt
    for (const key of UNTRUSTED_REDIRECT_QUERY_KEYS) {
      const val = req.query?.[key];
      if (val !== undefined && String(val).trim() !== '') {
        rejectedReason = 'Untrusted redirect parameter is not permitted.';
        break;
      }
    }

    // 2. Strictly match the request's origin against the preapproved exact allowlist (never construct an arbitrary URL)
    if (!rejectedReason) {
      const reqOrigin = getRequestOrigin(req);
      const exactCandidate = `${reqOrigin}/api/auth/google/callback`;
      if (PREAPPROVED_GOOGLE_REDIRECT_SET.has(exactCandidate)) {
        redirectUri = exactCandidate;
      } else {
        rejectedReason = 'Request host does not match any preapproved OAuth redirect URI.';
      }
    }
  } else if (hasAllowlist) {
    redirectUri = PREAPPROVED_GOOGLE_REDIRECTS[0];
  }

  return {
    enabled: Boolean(clientId && clientSecret && hasAllowlist),
    clientId,
    clientSecret,
    redirectUri,
    rejectedReason,
    allowlist: PREAPPROVED_GOOGLE_REDIRECTS,
  };
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb', strict: true }));

// Lazy-initialize the database on first request (required for serverless cold starts on Vercel)
let storeReadyPromise = null;
function ensureStoreReady() {
  if (!storeReadyPromise) {
    storeReadyPromise = initStore().catch((err) => {
      storeReadyPromise = null;
      throw err;
    });
  }
  return storeReadyPromise;
}

app.use('/api', async (_req, res, next) => {
  try {
    await ensureStoreReady();
    next();
  } catch (err) {
    console.error('[DB INIT ERROR]', IS_PRODUCTION ? err?.message : err);
    res.status(503).json({
      error: 'Database service is currently unavailable. Please try again shortly.',
    });
  }
});

// Prototype-pollution & HTTP Parameter Pollution (HPP) guard + JSON Content-Type enforcement
function stripDangerousKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) stripDangerousKeys(item);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      stripDangerousKeys(obj[key]);
    }
  }
  return obj;
}

app.use('/api', (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    stripDangerousKeys(req.body);
  }
  // Prevent HTTP Parameter Pollution (duplicate query params turned into arrays)
  if (req.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (Array.isArray(v)) {
        return res.status(400).json({ error: `Duplicate query parameter "${k}" is not allowed.` });
      }
    }
  }
  // Enforce application/json on API state-changing requests with a body (CSRF defense-in-depth)
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    const contentLength = Number(req.headers['content-length'] || 0);
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (contentLength > 0 && !ct.includes('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json.' });
    }
  }
  next();
});

// Per-account brute-force lockout (DB-backed so distributed credential stuffing is blocked across serverless instances)
const ACCOUNT_LOCKOUT_MAX = 5;
const ACCOUNT_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

async function checkAccountLockout(email) {
  return store.checkAccountLockout(email, ACCOUNT_LOCKOUT_MAX);
}

async function recordAccountFailure(email) {
  await store.recordAccountFailure(email, ACCOUNT_LOCKOUT_WINDOW_MS);
}

async function clearAccountLockout(email) {
  await store.clearAccountLockout(email);
}

// Production security headers (CSP, HSTS, Clickjacking, MIME sniffing, Referrer & Permissions)
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (IS_PRODUCTION && isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Strict Same-Origin / Allowlist CORS & Cross-Origin Mutation Guard
app.use('/api', (req, res, next) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/+$/, '') : '';
  if (!origin) {
    return next();
  }

  const sameOrigin = getRequestOrigin(req);
  const isAllowed = origin === sameOrigin || ALLOWED_ORIGINS.has(origin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  }

  if (req.method === 'OPTIONS' || ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  return next();
});

// Lightweight in-memory rate limiter
function createRateLimiter({ windowMs, maxRequests, message }) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = getClientIp(req) || 'unknown';
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (buckets.size > 10000) {
      for (const [k, v] of buckets.entries()) {
        if (now > v.resetAt) buckets.delete(k);
      }
    }
    if (entry.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

const apiRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 240,
  message: 'Too many requests. Please slow down and try again shortly.',
});

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 25,
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

const claimRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many scan requests from this network. Please wait a moment and retry.',
});

const checkinRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 45,
  message: 'Too many check-in attempts from this network. Please wait a moment and retry.',
});

const supportRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many problem reports submitted recently. Please wait a few minutes before sending another.',
});

const ownerOtpRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 6,
  message: 'Too many owner verification attempts. Please wait 15 minutes.',
});

const ownerMetricsRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 40,
  message: 'Too many requests. Please slow down.',
});

app.use('/api', apiRateLimit);

// SSE listeners per sessionId
const sseClients = new Map();

function broadcastSessionEvent(sessionId, eventName, data) {
  const clients = sseClients.get(sessionId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function escapeCsv(val) {
  let str = String(val ?? '');
  // Prevent CSV / spreadsheet formula injection (=, +, -, @, tab, CR)
  if (/^[\s]*[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sendCsv(res, filename, rows) {
  const safeFilename = String(filename || 'export.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send('\uFEFF' + csv);
}

// Async route wrapper so unexpected DB errors return clean 500 JSON
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function issueTeacherToken(teacher) {
  return signAuthToken({
    teacherId: teacher.id,
    pwv: getPasswordVersion(teacher.passwordHash),
  });
}

// Auth middleware factory for Teacher Administrator routes
function createRequireTeacher({ allowQueryToken = false } = {}) {
  return asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const queryToken =
      allowQueryToken && typeof req.query.auth === 'string' ? req.query.auth.trim() : null;
    const token = bearer || queryToken;
    const payload = verifyAuthToken(token);
    if (!payload?.teacherId || typeof payload.pwv !== 'string') {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    const teacher = await store.findTeacherById(payload.teacherId);
    if (!teacher) {
      return res.status(401).json({ error: 'Account not found. Please sign in again.' });
    }
    if ((teacher.role || 'admin') !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    const currentPwv = getPasswordVersion(teacher.passwordHash);
    if (!safeEqualStrings(payload.pwv, currentPwv)) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    req.teacher = teacher;
    store.touchTeacherLastSeen(teacher.id).catch(() => {});
    next();
  });
}

const requireTeacher = createRequireTeacher({ allowQueryToken: false });
const requireTeacherQueryAllowed = createRequireTeacher({ allowQueryToken: true });

function setOwnerSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

function clearOwnerGateCookie(req, res) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const secureFlag = isHttps ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${OWNER_GATE_COOKIE_NAME}=; Path=/api/owner; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`
  );
}

// Stealth owner-only authentication: returns 404 to BOTH unauthenticated and non-owner callers
const requireStealthOwner = asyncHandler(async (req, res, next) => {
  setOwnerSecurityHeaders(res);
  if (!OWNER_EMAIL) {
    return res.status(404).json({ error: 'Not found.' });
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const payload = verifyAuthToken(token);
  if (!payload?.teacherId || typeof payload.pwv !== 'string') {
    return res.status(404).json({ error: 'Not found.' });
  }
  const teacher = await store.findTeacherById(payload.teacherId);
  if (!teacher || (teacher.role || 'admin') !== 'admin') {
    return res.status(404).json({ error: 'Not found.' });
  }
  const currentPwv = getPasswordVersion(teacher.passwordHash);
  if (!safeEqualStrings(payload.pwv, currentPwv)) {
    return res.status(404).json({ error: 'Not found.' });
  }
  if (!isOwnerEmail(teacher.email)) {
    return res.status(404).json({ error: 'Not found.' });
  }
  req.teacher = teacher;
  req.teacherPwv = currentPwv;
  store.touchTeacherLastSeen(teacher.id).catch(() => {});
  next();
});

// Second-factor HttpOnly cookie gate bound to teacherId + password version + revocable DB nonce
const requireOwnerGate = asyncHandler(async (req, res, next) => {
  setOwnerSecurityHeaders(res);
  const cookies = parseCookies(req);
  const rawSigned = cookies[OWNER_GATE_COOKIE_NAME];
  const verified = verifyCookieValue(rawSigned);
  if (!verified) {
    return res.status(403).json({
      error: 'Email verification code required to unlock the Owner Monitor.',
      requiresOwnerVerification: true,
    });
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(verified, 'base64url').toString('utf8'));
  } catch {
    clearOwnerGateCookie(req, res);
    return res.status(403).json({
      error: 'Owner verification session expired. Please verify again.',
      requiresOwnerVerification: true,
    });
  }
  const session = data?.nonce ? await store.getOwnerGateSession(data.nonce) : null;
  const now = Date.now();
  if (
    !session ||
    now > session.expiresAt ||
    !safeEqualStrings(session.teacherId, req.teacher.id) ||
    !safeEqualStrings(session.pwv, req.teacherPwv) ||
    !safeEqualStrings(data.teacherId || '', req.teacher.id)
  ) {
    if (data?.nonce) await store.deleteOwnerGateSession(data.nonce);
    clearOwnerGateCookie(req, res);
    return res.status(403).json({
      error: 'Owner verification session expired. Please verify again.',
      requiresOwnerVerification: true,
    });
  }
  req.ownerGateNonce = data.nonce;
  next();
});

function sanitizeTeacher(teacher) {
  const safe = {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    role: teacher.role || 'admin',
  };
  if (isOwnerEmail(teacher.email)) {
    safe.isOwner = true;
  }
  return safe;
}

async function sanitizeSession(session) {
  const cls = await store.getClassById(session.classId);
  const { secret, ...safe } = session;
  return {
    ...safe,
    className: cls?.name || 'Course',
    classCode: cls?.code || '',
    room: session.room || cls?.room || '',
  };
}

function sanitizeRecord(record) {
  const { deviceCookieId, clientIp, ...safe } = record;
  return safe;
}

function getOrAssignDeviceCookie(req, res) {
  const cookies = parseCookies(req);
  const existing = verifyCookieValue(cookies[DEVICE_COOKIE_NAME]);
  if (existing) {
    return existing;
  }
  const freshId = `dck_${crypto.randomBytes(12).toString('hex')}`;
  const signed = signCookieValue(freshId);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const secureFlag = isHttps ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${DEVICE_COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secureFlag}`
  );
  return freshId;
}

// Health check (for cloud hosting platforms such as Vercel / Railway / Koyeb / Fly.io)
app.get('/api/health', (_req, res) => {
  const payload = {
    ok: true,
    time: new Date().toISOString(),
    realtimeMode: IS_VERCEL ? 'poll' : 'sse',
  };
  if (!IS_PRODUCTION) {
    payload.database = store.getDialect();
  }
  res.json(payload);
});

// ==========================================
// TEACHER ADMINISTRATOR AUTH ROUTES
// ==========================================
app.post(
  '/api/auth/register/request',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { name, email, password, consentAccepted } = req.body || {};
    const cleanName = sanitizeText(name, 100);
    const trimmedEmail = sanitizeText(email, 254).toLowerCase();
    if (consentAccepted !== true) {
      return res.status(400).json({
        error: 'Please review and accept the Privacy Policy to create an account.',
      });
    }
    if (
      !cleanName ||
      !trimmedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        error: 'Please provide your name, a valid email address, and a secure password.',
      });
    }
    const pwCheck = validateStrongPassword(password, trimmedEmail);
    if (!pwCheck.ok) {
      return res.status(400).json({ error: pwCheck.error });
    }
    if (await store.findTeacherByEmail(trimmedEmail)) {
      return res.status(409).json({
        error: 'An administrator account with this email already exists.',
      });
    }

    const pending = await store.createEmailVerification({
      name: cleanName,
      email: trimmedEmail,
      password,
    });

    try {
      const delivery = await sendSignupVerificationEmail({
        to: pending.email,
        name: pending.name,
        code: pending.code,
        expiresInMinutes: 15,
      });

      if (!delivery.delivered && IS_PRODUCTION) {
        return res.status(503).json({
          error: 'Email verification service is temporarily unavailable. Please try again shortly.',
        });
      }

      res.json({
        ok: true,
        email: pending.email,
        delivered: delivery.delivered,
        message: delivery.delivered
          ? `We sent a 6-digit verification code to ${pending.email}. Enter it below to complete sign up.`
          : 'Email delivery is not configured locally. Your 6-digit verification code was logged in the development server terminal.',
      });
    } catch (err) {
      console.error('[MAIL ERROR]', IS_PRODUCTION ? err?.message : err);
      return res.status(502).json({
        error: 'Could not send the verification email. Please try again in a moment.',
      });
    }
  })
);

app.post(
  '/api/auth/register/verify',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { email, code } = req.body || {};
    const result = await store.verifyEmailAndCreateTeacher({ email, code });
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    const token = issueTeacherToken(result.teacher);
    res.status(201).json({ token, teacher: sanitizeTeacher(result.teacher) });
  })
);

app.post('/api/auth/register', authRateLimit, (_req, res) => {
  res.status(400).json({
    error: 'Email verification is required before creating an account. Please request a verification code first.',
    code: 'EMAIL_VERIFICATION_REQUIRED',
  });
});

app.post(
  '/api/auth/login',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = sanitizeText(email, 254).toLowerCase();
    if (!cleanEmail || typeof password !== 'string' || !password || password.length > 128) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const lockSec = await checkAccountLockout(cleanEmail);
    if (lockSec) {
      res.setHeader('Retry-After', String(lockSec));
      return res.status(429).json({
        error: 'Too many failed sign-in attempts for this account. Please wait 15 minutes or reset your password.',
      });
    }
    const teacher = await store.findTeacherByEmail(cleanEmail);
    if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
      await recordAccountFailure(cleanEmail);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    await clearAccountLockout(cleanEmail);
    const token = issueTeacherToken(teacher);
    res.json({ token, teacher: sanitizeTeacher(teacher) });
  })
);

app.get('/api/auth/providers', (_req, res) => {
  const google = getGoogleOAuthConfig();
  res.json({ google: google.enabled });
});

app.get('/api/auth/google', authRateLimit, (req, res) => {
  const google = getGoogleOAuthConfig(req);
  if (!google.enabled) {
    return res.redirect(
      `/#auth_error=${encodeURIComponent(
        'Google Sign-In is currently unavailable. Please sign in with your email and password.'
      )}`
    );
  }
  if (google.rejectedReason || !google.redirectUri || !PREAPPROVED_GOOGLE_REDIRECT_SET.has(google.redirectUri)) {
    return res.status(400).json({
      error: google.rejectedReason || 'OAuth redirect URI is not in the preapproved allowlist.',
      code: 'DISALLOWED_REDIRECT_URI',
    });
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const payload = Buffer.from(
    JSON.stringify({
      state,
      codeVerifier,
      redirectUri: google.redirectUri,
      exp: Date.now() + 10 * 60 * 1000,
    })
  ).toString('base64url');

  const signed = signCookieValue(payload);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const secureFlag = isHttps ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag}`
  );

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', google.clientId);
  authUrl.searchParams.set('redirect_uri', google.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  res.redirect(authUrl.toString());
});

app.get(
  '/api/auth/google/callback',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const clearStateCookie = () => {
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const secureFlag = isHttps ? '; Secure' : '';
      res.setHeader(
        'Set-Cookie',
        `${OAUTH_STATE_COOKIE_NAME}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
      );
    };
    const failRedirect = (message) => {
      clearStateCookie();
      return res.redirect(`/#auth_error=${encodeURIComponent(message)}`);
    };

    const google = getGoogleOAuthConfig(req);
    if (!google.enabled) {
      return failRedirect('Google Sign-In is not configured on the server.');
    }
    if (google.rejectedReason) {
      clearStateCookie();
      return res.status(400).json({
        error: google.rejectedReason,
        code: 'DISALLOWED_REDIRECT_URI',
      });
    }

    if (req.query.error) {
      return failRedirect('Google sign-in was cancelled or denied.');
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) {
      return failRedirect('Invalid Google sign-in response. Please try again.');
    }

    const cookies = parseCookies(req);
    const verifiedPayload = verifyCookieValue(cookies[OAUTH_STATE_COOKIE_NAME]);
    if (!verifiedPayload) {
      return failRedirect('Google sign-in session expired. Please try again.');
    }

    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(verifiedPayload, 'base64url').toString('utf8'));
    } catch {
      return failRedirect('Invalid Google sign-in state. Please try again.');
    }

    if (
      !stateData ||
      !safeEqualStrings(stateData.state, state) ||
      !stateData.codeVerifier ||
      !PREAPPROVED_GOOGLE_REDIRECT_SET.has(stateData.redirectUri) ||
      Date.now() > Number(stateData.exp || 0)
    ) {
      return failRedirect('Google sign-in verification failed. Please try again.');
    }

    clearStateCookie();

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: stateData.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: stateData.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      return res.redirect(
        `/#auth_error=${encodeURIComponent('Could not complete Google sign-in. Please verify your Google OAuth credentials and redirect URI.')}`
      );
    }

    const tokenData = await tokenRes.json();
    if (!tokenData?.access_token) {
      return res.redirect(
        `/#auth_error=${encodeURIComponent('Google did not return an access token. Please try again.')}`
      );
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      return res.redirect(
        `/#auth_error=${encodeURIComponent('Failed to retrieve your Google account profile.')}`
      );
    }

    const profile = await profileRes.json();
    const email = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : '';
    const emailVerified = profile?.email_verified === true;
    if (!email || !emailVerified) {
      return res.redirect(
        `/#auth_error=${encodeURIComponent('Your Google account must have a verified email address.')}`
      );
    }

    let teacher = await store.findTeacherByEmail(email);
    if (!teacher) {
      const displayName =
        (typeof profile?.name === 'string' && profile.name.trim()) ||
        email.split('@')[0] ||
        'Instructor';
      teacher = await store.createTeacher({
        name: displayName,
        email,
        password: crypto.randomBytes(32).toString('hex'),
      });
    }

    const token = issueTeacherToken(teacher);
    res.redirect(`/#google_auth=${encodeURIComponent(token)}`);
  })
);

app.get('/api/auth/me', requireTeacher, (req, res) => {
  res.json({ teacher: sanitizeTeacher(req.teacher) });
});

app.post(
  '/api/auth/heartbeat',
  requireTeacher,
  asyncHandler(async (req, res) => {
    await store.touchTeacherLastSeen(req.teacher.id, { force: true });
    res.json({ ok: true });
  })
);

app.post(
  '/api/owner/request-code',
  requireStealthOwner,
  ownerOtpRateLimit,
  asyncHandler(async (_req, res) => {
    const now = Date.now();
    const otpState = await store.getOwnerOtpState();
    if (otpState?.lockedUntil && now < otpState.lockedUntil) {
      const waitMin = Math.max(1, Math.ceil((otpState.lockedUntil - now) / 60000));
      return res.status(429).json({
        error: `Owner verification is temporarily locked. Try again in ${waitMin} minute(s).`,
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await store.setOwnerOtp({
      codeHash: hashOwnerOtp(code),
      expiresAtMs: now + OWNER_OTP_TTL_MS,
    });

    try {
      const result = await sendOwnerSecurityCodeEmail({
        to: OWNER_EMAIL,
        code,
        expiresInMinutes: 5,
      });
      if (!result.delivered) {
        await store.clearOwnerOtp();
        return res.status(503).json({
          error: 'Email delivery is not configured on the server. Owner 2FA requires working email delivery.',
        });
      }
    } catch (err) {
      await store.clearOwnerOtp();
      console.error('[OWNER 2FA MAIL ERROR]', IS_PRODUCTION ? err?.message : err);
      return res.status(502).json({
        error: 'Could not send security code right now. Please try again shortly.',
      });
    }

    res.json({
      ok: true,
      message: `A 6-digit security code has been sent to ${OWNER_EMAIL}.`,
    });
  })
);

app.post(
  '/api/owner/verify-code',
  requireStealthOwner,
  ownerOtpRateLimit,
  asyncHandler(async (req, res) => {
    const now = Date.now();
    const otpState = await store.getOwnerOtpState();
    if (otpState?.lockedUntil && now < otpState.lockedUntil) {
      const waitMin = Math.max(1, Math.ceil((otpState.lockedUntil - now) / 60000));
      return res.status(429).json({
        error: `Owner verification is temporarily locked. Try again in ${waitMin} minute(s).`,
      });
    }

    const cleanCode = String(req.body?.code || '').replace(/\D/g, '').trim();
    if (cleanCode.length !== 6) {
      return res.status(400).json({ error: 'Enter the 6-digit verification code sent to your email.' });
    }

    if (!otpState || !otpState.codeHash || !otpState.expiresAt || now > otpState.expiresAt) {
      await store.clearOwnerOtp();
      return res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
    }

    const candidateHash = hashOwnerOtp(cleanCode);
    if (!safeEqualStrings(candidateHash, otpState.codeHash)) {
      const failure = await store.recordOwnerOtpFailure({
        maxAttempts: OWNER_OTP_MAX_ATTEMPTS,
        lockoutMs: OWNER_OTP_LOCKOUT_MS,
      });
      if (failure.locked) {
        return res.status(429).json({
          error: 'Too many invalid codes. Owner verification is locked for 15 minutes.',
        });
      }
      return res.status(401).json({
        error: `Invalid verification code. ${failure.remaining} attempt${failure.remaining === 1 ? '' : 's'} left.`,
      });
    }

    // Burn single-use code immediately and issue revocable DB-backed HttpOnly gate session
    await store.clearOwnerOtp({ keepLock: false });

    const nonce = crypto.randomBytes(24).toString('hex');
    const expiresAt = now + OWNER_GATE_TTL_MS;
    await store.createOwnerGateSession({
      nonce,
      teacherId: req.teacher.id,
      pwv: req.teacherPwv,
      expiresAtMs: expiresAt,
    });

    const payloadB64 = Buffer.from(
      JSON.stringify({ nonce, teacherId: req.teacher.id, exp: expiresAt })
    ).toString('base64url');
    const signedCookie = signCookieValue(payloadB64);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const secureFlag = isHttps ? '; Secure' : '';

    res.setHeader(
      'Set-Cookie',
      `${OWNER_GATE_COOKIE_NAME}=${encodeURIComponent(signedCookie)}; Path=/api/owner; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(OWNER_GATE_TTL_MS / 1000)}${secureFlag}`
    );

    res.json({ ok: true, expiresInSeconds: Math.floor(OWNER_GATE_TTL_MS / 1000) });
  })
);

app.post(
  '/api/owner/lock',
  requireStealthOwner,
  asyncHandler(async (req, res) => {
    const cookies = parseCookies(req);
    const verified = verifyCookieValue(cookies[OWNER_GATE_COOKIE_NAME]);
    if (verified) {
      try {
        const data = JSON.parse(Buffer.from(verified, 'base64url').toString('utf8'));
        if (data?.nonce) await store.deleteOwnerGateSession(data.nonce);
      } catch {}
    }
    clearOwnerGateCookie(req, res);
    res.json({ ok: true });
  })
);

app.get(
  '/api/owner/metrics',
  requireStealthOwner,
  ownerMetricsRateLimit,
  requireOwnerGate,
  asyncHandler(async (_req, res) => {
    const metrics = await store.getOwnerPlatformMetrics();
    res.json(metrics);
  })
);

app.post(
  '/api/auth/change-password',
  authRateLimit,
  requireTeacher,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword
    ) {
      return res.status(400).json({
        error: 'Current password and a new password are required.',
      });
    }
    const pwCheck = validateStrongPassword(newPassword, req.teacher.email);
    if (!pwCheck.ok) {
      return res.status(400).json({ error: pwCheck.error });
    }
    if (!verifyPassword(currentPassword, req.teacher.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    await store.updateTeacherPassword(req.teacher.id, newPassword);
    // Revoke any active owner gate sessions on password change
    await store.deleteOwnerGateSessionsForTeacher(req.teacher.id);
    const refreshed = await store.findTeacherById(req.teacher.id);
    const token = refreshed ? issueTeacherToken(refreshed) : null;
    res.json({ ok: true, token, message: 'Password updated successfully.' });
  })
);

app.delete(
  '/api/auth/account',
  authRateLimit,
  requireTeacher,
  asyncHandler(async (req, res) => {
    const { confirmation } = req.body || {};
    if (String(confirmation || '').trim().toUpperCase() !== 'DELETE') {
      return res.status(400).json({
        error: 'Please type DELETE to permanently confirm account deletion.',
      });
    }
    await store.deleteTeacher(req.teacher.id, req.teacher.email);
    res.json({ ok: true, message: 'Your account and all associated data have been permanently deleted.' });
  })
);

app.post(
  '/api/support/report',
  requireTeacher,
  supportRateLimit,
  asyncHandler(async (req, res) => {
    const { category = 'Bug / Error', subject = '', message = '' } = req.body || {};
    const cleanCategory = sanitizeText(category, 60) || 'General';
    const cleanSubject = sanitizeText(subject, 160);
    const cleanMessage = sanitizeMultilineText(message, 4000);
    if (!cleanSubject || cleanSubject.length < 3) {
      return res.status(400).json({ error: 'Please enter a brief subject for your report.' });
    }
    if (!cleanMessage || cleanMessage.length < 10) {
      return res.status(400).json({ error: 'Please describe the problem in at least 10 characters.' });
    }

    const report = await store.createSupportReport({
      teacherId: req.teacher.id,
      senderName: req.teacher.name,
      senderEmail: req.teacher.email,
      category: cleanCategory,
      subject: cleanSubject,
      message: cleanMessage,
    });

    try {
      await sendSupportReportEmail({
        reportId: report.id,
        senderName: report.senderName,
        senderEmail: report.senderEmail,
        category: report.category,
        subject: report.subject,
        message: report.message,
      });
    } catch (err) {
      console.error('[SUPPORT MAIL ERROR]', IS_PRODUCTION ? err?.message : err);
      return res.status(502).json({
        error: 'Your report was saved, but email delivery failed temporarily. Please try again shortly.',
      });
    }

    res.status(201).json({
      ok: true,
      reportId: report.id,
      message: 'Thank you! Your report has been sent to our support team.',
    });
  })
);

app.post(
  '/api/auth/forgot-password',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    const cleanEmail = sanitizeText(email, 254).toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: 'Please enter your account email address.' });
    }
    const teacher = await store.findTeacherByEmail(cleanEmail);
    if (teacher) {
      const { code, expiresAt } = await store.createPasswordResetToken(teacher.id);
      try {
        await sendPasswordResetEmail({
          to: teacher.email,
          name: teacher.name,
          code,
          expiresAt,
        });
      } catch (err) {
        console.error('[PASSWORD RESET MAIL ERROR]', IS_PRODUCTION ? err?.message : err);
        if (!IS_PRODUCTION) {
          console.log(`\n[PASSWORD RESET] Account: ${teacher.email} | Code: ${code} | Expires: ${expiresAt}\n`);
        }
      }
    }
    // Always return the same response so account existence cannot be enumerated
    res.json({
      ok: true,
      message:
        isEmailConfigured() || IS_PRODUCTION
          ? 'If an account matches that email, a 15-minute reset code has been sent to your inbox.'
          : 'If an account matches that email, a 15-minute reset code has been generated in the development server log.',
    });
  })
);

app.post(
  '/api/auth/reset-password',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { email, code, newPassword } = req.body || {};
    const cleanEmail = sanitizeText(email, 254).toLowerCase();
    const cleanCode = sanitizeText(code, 32);
    if (!cleanEmail || !cleanCode || typeof newPassword !== 'string') {
      return res.status(400).json({
        error: 'Email, reset code, and a new password are required.',
      });
    }
    const pwCheck = validateStrongPassword(newPassword, cleanEmail);
    if (!pwCheck.ok) {
      return res.status(400).json({ error: pwCheck.error });
    }
    const lockSec = await checkAccountLockout(`reset:${cleanEmail}`);
    if (lockSec) {
      res.setHeader('Retry-After', String(lockSec));
      return res.status(429).json({
        error: 'Too many failed reset code attempts. Please wait 15 minutes and request a new code.',
      });
    }
    const result = await store.consumePasswordResetToken(cleanEmail, cleanCode, newPassword);
    if (!result.ok) {
      await recordAccountFailure(`reset:${cleanEmail}`);
      return res.status(400).json({ error: result.error });
    }
    await clearAccountLockout(`reset:${cleanEmail}`);
    await clearAccountLockout(cleanEmail);
    res.json({ ok: true, message: 'Password has been reset. You may now sign in.' });
  })
);

// ==========================================
// SAVED COURSE CODES / CLASSES ROUTES
// ==========================================
app.get(
  '/api/classes',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const classes = await store.getClassesByTeacher(req.teacher.id);
    res.json({ classes });
  })
);

app.post(
  '/api/classes',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const { code, name, room } = req.body || {};
    if (!code?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'Course code and course title are required.' });
    }
    const cls = await store.createClass({
      teacherId: req.teacher.id,
      code,
      name,
      room,
    });
    res.status(201).json({ class: cls });
  })
);

app.patch(
  '/api/classes/:id',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const cls = await store.getClassById(req.params.id);
    if (!cls || cls.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    const { code, name, room } = req.body || {};
    const updated = await store.updateClass(cls.id, { code, name, room });
    res.json({ class: updated });
  })
);

app.delete(
  '/api/classes/:id',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const cls = await store.getClassById(req.params.id);
    if (!cls || cls.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    await store.deleteClass(cls.id);
    res.json({ ok: true });
  })
);

// ==========================================
// SESSIONS ROUTES (Teacher Administrator)
// ==========================================
app.get(
  '/api/sessions',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const classId = req.query.classId || null;
    const rawSessions = await store.getSessionsByTeacher(req.teacher.id, classId);
    const sessions = rawSessions.map(({ secret, ...rest }) => rest);
    res.json({ sessions });
  })
);

app.post(
  '/api/sessions',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const {
      classId,
      title,
      room,
      rotateIntervalSec = 8,
      preventDuplicateDevice = true,
      lateAfterMinutes = null,
      geoLock = null,
    } = req.body || {};
    const cls = await store.getClassById(classId);
    if (!cls || cls.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    const session = await store.createSession({
      teacherId: req.teacher.id,
      classId,
      title,
      room,
      rotateIntervalSec,
      preventDuplicateDevice,
      lateAfterMinutes,
      geoLock,
    });
    res.status(201).json({ session: await sanitizeSession(session) });
  })
);

app.get(
  '/api/sessions/:id',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const records = (await store.getRecordsBySession(session.id)).map(sanitizeRecord);
    const qr = getSessionQrToken(session);
    const lanIp = IS_PRODUCTION ? null : getLocalLanIp();
    const lanOrigin = lanIp ? `http://${lanIp}:${PORT}` : null;
    res.json({
      session: await sanitizeSession(session),
      records,
      qr,
      lanOrigin,
      realtimeMode: IS_VERCEL ? 'poll' : 'sse',
    });
  })
);

app.get(
  '/api/sessions/:id/qr',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const qr = getSessionQrToken(session);
    const lanIp = IS_PRODUCTION ? null : getLocalLanIp();
    const lanOrigin = lanIp ? `http://${lanIp}:${PORT}` : null;
    res.json({
      status: session.status,
      qr,
      lanOrigin,
    });
  })
);

app.patch(
  '/api/sessions/:id',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const updated = await store.updateSession(session.id, req.body || {});
    const safe = await sanitizeSession(updated);
    broadcastSessionEvent(session.id, 'session_update', safe);
    res.json({ session: safe });
  })
);

app.delete(
  '/api/sessions/:id',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    await store.deleteSession(session.id);
    res.json({ ok: true });
  })
);

// Live SSE stream for real-time attendance feed
app.get(
  '/api/sessions/:id/stream',
  requireTeacherQueryAllowed,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (IS_VERCEL) {
      res.write(`event: use_polling\ndata: ${JSON.stringify({ sessionId: session.id })}\n\n`);
      return res.end();
    }

    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId: session.id })}\n\n`);

    if (!sseClients.has(session.id)) {
      sseClients.set(session.id, new Set());
    }
    sseClients.get(session.id).add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.get(session.id)?.delete(res);
    });
  })
);

// Teacher manual check-in (for a student physically in class without a phone)
app.post(
  '/api/sessions/:id/manual-checkin',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const { studentId, studentName, note, status } = req.body || {};
    if (!studentId?.trim() || !studentName?.trim()) {
      return res.status(400).json({ error: 'Student ID and full name are required.' });
    }
    const result = await store.addRecord({
      sessionId: session.id,
      studentId,
      studentName,
      note,
      status: status === 'late' || status === 'present' ? status : null,
      method: 'manual',
    });
    if (result.error === 'ALREADY_CHECKED_IN') {
      return res.status(409).json({
        error: `${result.existing.studentName} (${result.existing.studentId}) is already recorded.`,
      });
    }
    const safeRecord = sanitizeRecord(result.record);
    broadcastSessionEvent(session.id, 'checkin', safeRecord);
    res.status(201).json({ record: safeRecord });
  })
);

// Update record status (Present / Late) or note
app.patch(
  '/api/sessions/:id/records/:recordId',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const { status, note } = req.body || {};
    const updated = await store.updateRecord(req.params.recordId, session.id, { status, note });
    if (!updated) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    const safeRecord = sanitizeRecord(updated);
    broadcastSessionEvent(session.id, 'record_updated', safeRecord);
    res.json({ record: safeRecord });
  })
);

app.delete(
  '/api/sessions/:id/records/:recordId',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const removed = await store.removeRecord(req.params.recordId, session.id);
    if (!removed) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    broadcastSessionEvent(session.id, 'record_removed', { recordId: req.params.recordId });
    res.json({ ok: true });
  })
);

// Export CSV for a single session
app.get(
  '/api/sessions/:id/export.csv',
  requireTeacherQueryAllowed,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const cls = await store.getClassById(session.classId);
    const records = (await store.getRecordsBySession(session.id)).reverse();

    const rows = [
      [
        'Course Code',
        'Course Title',
        'Session',
        'Room',
        'Student ID',
        'Student Name',
        'Status',
        'Method',
        'Time Recorded',
        'Note',
      ],
      ...records.map((r) => [
        cls?.code || '',
        cls?.name || '',
        session.title,
        session.room || cls?.room || '',
        r.studentId,
        r.studentName,
        r.status === 'late' ? 'Late' : 'Present',
        r.method === 'qr' ? 'QR Scan' : 'Manual',
        new Date(r.checkedInAt).toLocaleString(),
        r.note || '',
      ]),
    ];

    const safeName = `${(cls?.code || 'attendance').replace(/[^a-zA-Z0-9_-]/g, '_')}_${session.startedAt.slice(0, 10)}.csv`;
    sendCsv(res, safeName, rows);
  })
);

// ==========================================
// REPORTS & BULK EXPORT ROUTES
// ==========================================
app.get(
  '/api/reports/summary',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const { classId = null, from = null, to = null } = req.query;
    const report = await store.getAttendanceReport(req.teacher.id, {
      classId: classId || null,
      from: from || null,
      to: to || null,
    });
    res.json({
      summary: report.summary,
      courses: report.courses,
      students: report.students,
    });
  })
);

app.get(
  '/api/reports/summary.csv',
  requireTeacherQueryAllowed,
  asyncHandler(async (req, res) => {
    const { classId = null, from = null, to = null } = req.query;
    const report = await store.getAttendanceReport(req.teacher.id, {
      classId: classId || null,
      from: from || null,
      to: to || null,
    });

    const rows = [
      [
        'Student ID',
        'Full Name',
        'Courses',
        'Sessions Attended',
        'Total Sessions',
        'Attendance Rate (%)',
        'On Time',
        'Late',
        'QR Scans',
        'Manual Entries',
        'Last Recorded',
      ],
      ...report.students.map((s) => [
        s.studentId,
        s.studentName,
        s.courses.join('; '),
        s.sessionsAttended,
        s.totalSessions,
        `${s.attendanceRate}%`,
        s.presentCount,
        s.lateCount,
        s.qrCount,
        s.manualCount,
        new Date(s.lastCheckedInAt).toLocaleString(),
      ]),
    ];

    const dateTag = new Date().toISOString().slice(0, 10);
    sendCsv(res, `attendance_summary_${dateTag}.csv`, rows);
  })
);

app.get(
  '/api/reports/records.csv',
  requireTeacherQueryAllowed,
  asyncHandler(async (req, res) => {
    const { classId = null, from = null, to = null } = req.query;
    const report = await store.getAttendanceReport(req.teacher.id, {
      classId: classId || null,
      from: from || null,
      to: to || null,
    });

    const rows = [
      [
        'Session Date',
        'Course Code',
        'Course Title',
        'Session',
        'Room',
        'Student ID',
        'Student Name',
        'Status',
        'Method',
        'Time Recorded',
        'Note',
      ],
      ...report.records.map((r) => [
        r.sessionStartedAt.slice(0, 10),
        r.classCode,
        r.className,
        r.sessionTitle,
        r.room,
        r.studentId,
        r.studentName,
        r.status === 'late' ? 'Late' : 'Present',
        r.method === 'qr' ? 'QR Scan' : 'Manual',
        new Date(r.checkedInAt).toLocaleString(),
        r.note || '',
      ]),
    ];

    const dateTag = new Date().toISOString().slice(0, 10);
    sendCsv(res, `attendance_register_bulk_${dateTag}.csv`, rows);
  })
);

// ==========================================
// PUBLIC STUDENT QR SCAN & ANTI-SHARE ROUTES
// ==========================================

app.post(
  '/api/public/claim',
  claimRateLimit,
  asyncHandler(async (req, res) => {
    const { sessionId, token, deviceId } = req.body || {};

    if (!sessionId || !token) {
      return res.status(400).json({
        error: 'Direct link access is not permitted. Scan the live QR code displayed in class.',
        code: 'QR_REQUIRED',
      });
    }

    const session = await store.getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Attendance session not found.', code: 'SESSION_NOT_FOUND' });
    }
    if (session.status === 'paused') {
      return res.status(403).json({
        error: 'Attendance is currently paused by the instructor.',
        code: 'SESSION_PAUSED',
      });
    }
    if (session.status === 'ended') {
      return res.status(403).json({ error: 'This attendance session has closed.', code: 'SESSION_ENDED' });
    }

    const validation = validateSessionToken(session, token);
    if (!validation.valid) {
      return res.status(403).json({
        error:
          'This QR code has expired. Screenshots and forwarded links cannot be used — scan the live code on screen.',
        code: 'QR_EXPIRED',
      });
    }

    const deviceCookieId = getOrAssignDeviceCookie(req, res);

    if (session.preventDuplicateDevice) {
      const existingDevice = await store.findDeviceRecordInSession(session.id, {
        deviceId: deviceId || '',
        deviceCookieId,
      });
      if (existingDevice) {
        return res.status(409).json({
          error: `This device already submitted attendance for ${existingDevice.studentName} (${existingDevice.studentId}).`,
          code: 'DEVICE_ALREADY_USED',
        });
      }
    }

    const ticket = await store.createClaimTicket({
      sessionId: session.id,
      deviceCookieId,
      deviceId: deviceId || '',
    });

    const [cls, teacher] = await Promise.all([
      store.getClassById(session.classId),
      store.findTeacherById(session.teacherId),
    ]);

    res.json({
      ticketId: ticket.ticketId,
      expiresAt: ticket.expiresAt,
      session: {
        id: session.id,
        title: session.title,
        room: session.room || cls?.room || '',
        status: session.status,
        classCode: cls?.code || '',
        className: cls?.name || '',
        teacherName: teacher?.name || 'Instructor',
        lateAfterMinutes: session.lateAfterMinutes,
        geoLockRequired: Boolean(session.geoLock),
        geoRadiusMeters: session.geoLock?.radiusMeters || null,
      },
    });
  })
);

app.post(
  '/api/public/checkin',
  checkinRateLimit,
  asyncHandler(async (req, res) => {
    const { ticketId, studentId, studentName, deviceId, coords } = req.body || {};
    const cleanStudentId = sanitizeText(studentId, 40);
    const cleanStudentName = sanitizeText(studentName, 100);

    if (!cleanStudentId || !cleanStudentName) {
      return res.status(400).json({ error: 'Please enter both your Student ID and Full Name.' });
    }

    const cookies = parseCookies(req);
    const deviceCookieId = verifyCookieValue(cookies[DEVICE_COOKIE_NAME]);

    const ticketCheck = await store.verifyClaimTicket({
      ticketId,
      deviceCookieId,
      deviceId: deviceId || '',
    });
    if (!ticketCheck.valid) {
      return res.status(403).json({
        error: ticketCheck.error,
        code: ticketCheck.code,
      });
    }

    const { ticket } = ticketCheck;
    const session = await store.getSessionById(ticket.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Attendance session not found.' });
    }
    if (session.status === 'paused') {
      return res.status(403).json({ error: 'Attendance is currently paused by the instructor.' });
    }
    if (session.status === 'ended') {
      return res.status(403).json({ error: 'This attendance session has closed.' });
    }

    if (session.geoLock) {
      const lat = Number(coords?.lat);
      const lng = Number(coords?.lng);
      if (
        !coords ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(403).json({
          error:
            'Location verification is required for this session. Allow location access in your browser and retry.',
          code: 'LOCATION_REQUIRED',
        });
      }
      const distance = haversineDistanceMeters(session.geoLock.lat, session.geoLock.lng, lat, lng);
      if (distance > session.geoLock.radiusMeters) {
        return res.status(403).json({
          error: `Your location is ${Math.round(distance)}m from the classroom (limit: ${session.geoLock.radiusMeters}m). Attendance must be recorded in class.`,
          code: 'OUTSIDE_CLASSROOM_GPS',
        });
      }
    }

    const result = await store.addRecord({
      sessionId: session.id,
      studentId: cleanStudentId,
      studentName: cleanStudentName,
      deviceId: deviceId || '',
      deviceCookieId: deviceCookieId || '',
      clientIp: '', // Data minimization: do not persist student IP addresses in attendance records
      method: 'qr',
    });

    const cls = await store.getClassById(session.classId);

    if (result.error === 'ALREADY_CHECKED_IN') {
      await store.burnClaimTicket(ticketId);
      return res.status(200).json({
        alreadyCheckedIn: true,
        message: 'Your attendance was already recorded for this session.',
        record: sanitizeRecord(result.existing),
        classInfo: {
          code: cls?.code || '',
          name: cls?.name || '',
          title: session.title,
        },
      });
    }

    if (result.error === 'DEVICE_ALREADY_USED') {
      await store.burnClaimTicket(ticketId);
      return res.status(409).json({
        error: `This device already submitted attendance for ${result.existing.studentName} (${result.existing.studentId}).`,
        code: 'DEVICE_ALREADY_USED',
      });
    }

    await store.burnClaimTicket(ticketId);

    const safeRecord = sanitizeRecord(result.record);
    broadcastSessionEvent(session.id, 'checkin', safeRecord);

    res.status(201).json({
      alreadyCheckedIn: false,
      message:
        safeRecord.status === 'late'
          ? 'Your attendance has been recorded (marked late).'
          : 'Your attendance has been recorded.',
      record: safeRecord,
      classInfo: {
        code: cls?.code || '',
        name: cls?.name || '',
        title: session.title,
      },
    });
  })
);

// ==========================================
// SERVE BUILT FRONTEND (non-Vercel standalone mode)
// ==========================================
const distDir = path.resolve(__dirname, '../dist');
if (!IS_VERCEL && fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      dotfiles: 'deny',
      etag: true,
      maxAge: IS_PRODUCTION ? '1h' : 0,
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Clean 404 JSON for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Global JSON error handler (never expose stack traces or internals)
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON request body.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload is too large.' });
  }
  console.error('[SERVER ERROR]', IS_PRODUCTION ? err?.message : err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function start() {
  const dbInfo = await ensureStoreReady();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `eriqo listening on port ${PORT} (database: ${dbInfo.dialect === 'postgres' ? 'postgresql' : 'sqlite'})`
    );
  });

  const shutdown = async () => {
    server.close(async () => {
      try {
        await getDb().close();
      } catch {}
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

const isMainModule =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!IS_VERCEL && isMainModule) {
  start().catch((err) => {
    console.error('Failed to start eriqo server:', err);
    process.exit(1);
  });
}

export { app, ensureStoreReady };
export default app;
