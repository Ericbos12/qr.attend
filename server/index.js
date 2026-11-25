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
  signAuthToken,
  verifyAuthToken,
  getSessionQrToken,
  validateSessionToken,
  parseCookies,
  signCookieValue,
  verifyCookieValue,
  createClaimTicket,
  verifyClaimTicket,
  burnClaimTicket,
} from './auth.js';
import { getClientIp, getLocalLanIp, haversineDistanceMeters } from './network.js';
import {
  isEmailConfigured,
  sendSignupVerificationEmail,
  sendPasswordResetEmail,
  sendSupportReportEmail,
} from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DEVICE_COOKIE_NAME = 'attendqr_dev';
const OAUTH_STATE_COOKIE_NAME = 'attendqr_oauth_state';

function getGoogleOAuthConfig(req) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const configuredRedirect = (process.env.GOOGLE_REDIRECT_URI || '').trim();
  let redirectUri = configuredRedirect;
  if (!redirectUri && req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`).split(',')[0].trim();
    redirectUri = `${proto}://${host}/api/auth/google/callback`;
  }
  return {
    enabled: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    redirectUri,
  };
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

// Production security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
  next();
});

// Lightweight in-memory rate limiter for auth & public scan routes
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
      return res.status(429).json({ error: message });
    }
    next();
  };
}

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 40,
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

const claimRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many scan requests from this network. Please wait a moment and retry.',
});

const supportRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many problem reports submitted recently. Please wait a few minutes before sending another.',
});

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
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sendCsv(res, filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
}

// Async route wrapper so unexpected DB errors return clean 500 JSON
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Auth middleware for Teacher Administrator routes
const requireTeacher = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const queryToken = req.query.auth || null;
  const token = bearer || queryToken;
  const payload = verifyAuthToken(token);
  if (!payload?.teacherId) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  const teacher = await store.findTeacherById(payload.teacherId);
  if (!teacher) {
    return res.status(401).json({ error: 'Account not found. Please sign in again.' });
  }
  req.teacher = teacher;
  next();
});

function sanitizeTeacher(teacher) {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    role: teacher.role || 'admin',
  };
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

// Health check (for cloud hosting platforms like Render / Railway / Fly.io)
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: store.getDialect(),
    time: new Date().toISOString(),
  });
});

// ==========================================
// TEACHER ADMINISTRATOR AUTH ROUTES
// ==========================================
app.post(
  '/api/auth/register/request',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};
    const trimmedEmail = String(email || '').trim().toLowerCase();
    if (
      !name?.trim() ||
      !trimmedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ||
      !password ||
      password.length < 6
    ) {
      return res.status(400).json({
        error: 'Please provide your name, a valid email address, and a password (minimum 6 characters).',
      });
    }
    if (await store.findTeacherByEmail(trimmedEmail)) {
      return res.status(409).json({
        error: 'An administrator account with this email already exists.',
      });
    }

    const pending = await store.createEmailVerification({
      name,
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

      res.json({
        ok: true,
        email: pending.email,
        delivered: delivery.delivered,
        message: delivery.delivered
          ? `We sent a 6-digit verification code to ${pending.email}. Enter it below to complete sign up.`
          : `Email delivery is not configured yet. Your 6-digit verification code was logged in the server terminal (add SMTP or RESEND_API_KEY in .env to send real emails).`,
      });
    } catch (err) {
      console.error('[MAIL ERROR]', err);
      return res.status(502).json({
        error: 'Could not send the verification email. Please check your SMTP/Resend settings in .env and try again.',
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
    const token = signAuthToken({ teacherId: result.teacher.id });
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
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const teacher = await store.findTeacherByEmail(email);
    if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = signAuthToken({ teacherId: teacher.id });
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
        'Google Sign-In is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file and restart the server.'
      )}`
    );
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
      stateData.state !== state ||
      !stateData.codeVerifier ||
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
        redirect_uri: stateData.redirectUri || google.redirectUri,
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

    const token = signAuthToken({ teacherId: teacher.id });
    res.redirect(`/#google_auth=${encodeURIComponent(token)}`);
  })
);

app.get('/api/auth/me', requireTeacher, (req, res) => {
  res.json({ teacher: sanitizeTeacher(req.teacher) });
});

app.post(
  '/api/auth/change-password',
  requireTeacher,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: 'Current password and a new password (minimum 6 characters) are required.',
      });
    }
    if (!verifyPassword(currentPassword, req.teacher.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    await store.updateTeacherPassword(req.teacher.id, newPassword);
    res.json({ ok: true, message: 'Password updated successfully.' });
  })
);

app.delete(
  '/api/auth/account',
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
    const cleanSubject = String(subject).trim();
    const cleanMessage = String(message).trim();
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
      category,
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
      console.error('[SUPPORT MAIL ERROR]', err);
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
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Please enter your account email address.' });
    }
    const teacher = await store.findTeacherByEmail(email);
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
        console.error('[PASSWORD RESET MAIL ERROR]', err);
        console.log(`\n[PASSWORD RESET] Account: ${teacher.email} | Code: ${code} | Expires: ${expiresAt}\n`);
      }
    }
    // Always return the same response so account existence cannot be enumerated
    res.json({
      ok: true,
      message: isEmailConfigured()
        ? 'If an account matches that email, a 15-minute reset code has been sent to your inbox.'
        : 'If an account matches that email, a 15-minute reset code has been generated in the server log.',
    });
  })
);

app.post(
  '/api/auth/reset-password',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { email, code, newPassword } = req.body || {};
    if (!email?.trim() || !code?.trim() || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: 'Email, reset code, and a new password (minimum 6 characters) are required.',
      });
    }
    const result = await store.consumePasswordResetToken(email, code, newPassword);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
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
    const lanIp = getLocalLanIp();
    const lanOrigin = lanIp ? `http://${lanIp}:${PORT}` : null;
    res.json({
      session: await sanitizeSession(session),
      records,
      qr,
      lanOrigin,
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
    const lanIp = getLocalLanIp();
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
  requireTeacher,
  asyncHandler(async (req, res) => {
    const session = await store.getSessionById(req.params.id);
    if (!session || session.teacherId !== req.teacher.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

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
  requireTeacher,
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
  requireTeacher,
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
  requireTeacher,
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

    const ticket = createClaimTicket({
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
  asyncHandler(async (req, res) => {
    const { ticketId, studentId, studentName, deviceId, coords } = req.body || {};

    if (!studentId?.trim() || !studentName?.trim()) {
      return res.status(400).json({ error: 'Please enter both your Student ID and Full Name.' });
    }

    const cookies = parseCookies(req);
    const deviceCookieId = verifyCookieValue(cookies[DEVICE_COOKIE_NAME]);

    const ticketCheck = verifyClaimTicket({
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
      if (!coords || Number.isNaN(lat) || Number.isNaN(lng)) {
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
      studentId,
      studentName,
      deviceId: deviceId || '',
      deviceCookieId: deviceCookieId || '',
      clientIp: getClientIp(req),
      method: 'qr',
    });

    const cls = await store.getClassById(session.classId);

    if (result.error === 'ALREADY_CHECKED_IN') {
      burnClaimTicket(ticketId);
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
      burnClaimTicket(ticketId);
      return res.status(409).json({
        error: `This device already submitted attendance for ${result.existing.studentName} (${result.existing.studentId}).`,
        code: 'DEVICE_ALREADY_USED',
      });
    }

    burnClaimTicket(ticketId);

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
// SERVE BUILT FRONTEND
// ==========================================
const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Global JSON error handler
app.use((err, _req, res, _next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function start() {
  const dbInfo = await initStore();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `AttendQR listening on port ${PORT} (database: ${dbInfo.dialect === 'postgres' ? 'postgresql' : 'sqlite'})`
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

start().catch((err) => {
  console.error('Failed to start AttendQR server:', err);
  process.exit(1);
});
