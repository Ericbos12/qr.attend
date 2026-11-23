import crypto from 'node:crypto';

const AUTH_SECRET = process.env.ATTENDQR_SECRET || 'attendqr-local-secret-change-in-prod-2026';

// In-memory single-use scan claim tickets (valid for 90s after live QR scan)
// Map<ticketId, { sessionId, deviceCookieId, deviceId, createdAt, expiresAt, used }>
const claimTickets = new Map();
const CLAIM_TICKET_TTL_MS = 90 * 1000;
const PREVIOUS_SLICE_GRACE_MS = 2500; // Strict 2.5s grace at rotation boundary (stops screenshot sharing)

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signAuthToken(payload) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Simple zero-dependency cookie parser.
 */
export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const result = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function signCookieValue(value) {
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url').slice(0, 22);
  return `${value}.${sig}`;
}

export function verifyCookieValue(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url').slice(0, 22);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

/**
 * Generates a fast-rotating cryptographic QR token for an attendance session.
 * Static QR codes are disallowed to prevent screenshot/link sharing.
 */
export function getSessionQrToken(session, nowMs = Date.now()) {
  const rawInterval = Number(session.rotateIntervalSec);
  const intervalSec = rawInterval >= 3 && rawInterval <= 15 ? rawInterval : 5;
  const intervalMs = intervalSec * 1000;
  const slice = Math.floor(nowMs / intervalMs);

  const hmac = crypto
    .createHmac('sha256', session.secret)
    .update(`${session.id}:${slice}:qr-v2`)
    .digest('base64url');

  const token = hmac.slice(0, 18);
  const expiresAt = (slice + 1) * intervalMs;
  const remainingMs = Math.max(0, expiresAt - nowMs);

  return {
    token,
    slice,
    intervalSec,
    expiresAt,
    remainingMs,
    serverTime: nowMs,
  };
}

/**
 * Strictly validates a scanned rotating QR token.
 * Accepts the current time slice, OR the immediately previous slice ONLY during a tiny
 * 2.5-second boundary grace window so an in-class student scanning right as the QR flips
 * succeeds, while any screenshot or forwarded link expires almost immediately.
 */
export function validateSessionToken(session, token, nowMs = Date.now()) {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) return { valid: false, reason: 'MISSING_TOKEN' };

  const rawInterval = Number(session.rotateIntervalSec);
  const intervalSec = rawInterval >= 3 && rawInterval <= 15 ? rawInterval : 5;
  const intervalMs = intervalSec * 1000;
  const currentSlice = Math.floor(nowMs / intervalMs);
  const elapsedInCurrentSliceMs = nowMs - currentSlice * intervalMs;

  const slicesToCheck = [currentSlice];
  if (elapsedInCurrentSliceMs <= PREVIOUS_SLICE_GRACE_MS && currentSlice > 0) {
    slicesToCheck.push(currentSlice - 1);
  }

  for (const slice of slicesToCheck) {
    const refTime = slice * intervalMs + 10;
    const expected = getSessionQrToken(session, refTime);
    const a = Buffer.from(normalizedToken);
    const b = Buffer.from(expected.token);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { valid: true, method: 'qr', slice };
    }
  }

  return { valid: false, reason: 'EXPIRED_OR_INVALID_TOKEN' };
}

/**
 * Creates a single-use, device-bound claim ticket after a live QR scan succeeds.
 * Allows the student 90s to enter their Student ID & Name without keeping the QR token in the URL.
 */
export function createClaimTicket({ sessionId, deviceCookieId, deviceId }) {
  cleanupExpiredTickets();
  const ticketId = `tkt_${crypto.randomBytes(16).toString('base64url')}`;
  const now = Date.now();
  const ticket = {
    ticketId,
    sessionId,
    deviceCookieId,
    deviceId: deviceId || '',
    createdAt: now,
    expiresAt: now + CLAIM_TICKET_TTL_MS,
    used: false,
  };
  claimTickets.set(ticketId, ticket);
  return ticket;
}

/**
 * Verifies a claim ticket belongs to this exact browser/device and hasn't expired or been used.
 */
export function verifyClaimTicket({ ticketId, deviceCookieId, deviceId }) {
  cleanupExpiredTickets();
  if (!ticketId || typeof ticketId !== 'string') {
    return { valid: false, error: 'Missing classroom scan verification. Please scan the live QR code in class.', code: 'NO_TICKET' };
  }
  const ticket = claimTickets.get(ticketId);
  if (!ticket) {
    return { valid: false, error: 'Scan session expired. Please scan the live QR code on the screen again.', code: 'TICKET_EXPIRED' };
  }
  if (ticket.used) {
    return { valid: false, error: 'This QR scan has already been used. Shared links cannot be reused.', code: 'TICKET_USED' };
  }
  if (Date.now() > ticket.expiresAt) {
    claimTickets.delete(ticketId);
    return { valid: false, error: 'Check-in window timed out. Please scan the live QR code on the screen again.', code: 'TICKET_EXPIRED' };
  }
  if (!deviceCookieId || ticket.deviceCookieId !== deviceCookieId) {
    return {
      valid: false,
      error: 'Device verification failed. Attendance links cannot be shared with another device — scan the live QR code in class.',
      code: 'DEVICE_MISMATCH',
    };
  }
  if (ticket.deviceId && deviceId && ticket.deviceId !== deviceId) {
    return {
      valid: false,
      error: 'Device verification mismatch. Please scan the live QR code directly on your own phone.',
      code: 'DEVICE_MISMATCH',
    };
  }
  return { valid: true, ticket };
}

export function burnClaimTicket(ticketId) {
  const ticket = claimTickets.get(ticketId);
  if (ticket) {
    ticket.used = true;
  }
}

function cleanupExpiredTickets() {
  const now = Date.now();
  for (const [id, ticket] of claimTickets.entries()) {
    if (now > ticket.expiresAt + 60000) {
      claimTickets.delete(id);
    }
  }
}
