
import crypto from 'node:crypto';

// ============================================================
// 1. AUTHENTICATION CONFIGURATION
// ============================================================

const AUTH_SECRET = process.env.ATTENDQR_SECRET;

if (
  typeof AUTH_SECRET !== 'string' ||
  Buffer.byteLength(AUTH_SECRET, 'utf8') < 32
) {
  throw new Error(
    'Security configuration error: ATTENDQR_SECRET must contain at least 32 bytes of securely generated random data.'
  );
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const CLAIM_TICKET_TTL_MS = 90 * 1000;
const PREVIOUS_SLICE_GRACE_MS = 2500;

const PASSWORD_KEY_LENGTH = 64;

// ============================================================
// 2. IN-MEMORY CLAIM TICKET STORAGE
// ============================================================

const claimTickets = new Map();

// ============================================================
// 3. PASSWORD HASHING
// ============================================================

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('A valid password is required.');
  }

  const salt = crypto.randomBytes(16).toString('hex');

  const hash = crypto
    .scryptSync(password, salt, PASSWORD_KEY_LENGTH)
    .toString('hex');

  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (
    typeof password !== 'string' ||
    typeof stored !== 'string'
  ) {
    return false;
  }

  const parts = stored.split(':');

  if (parts.length !== 2) return false;

  const [salt, key] = parts;

  if (
    !/^[a-f0-9]{32}$/i.test(salt) ||
    !/^[a-f0-9]{128}$/i.test(key)
  ) {
    return false;
  }

  try {
    const derived = crypto.scryptSync(
      password,
      salt,
      PASSWORD_KEY_LENGTH
    );

    const keyBuf = Buffer.from(key, 'hex');

    return crypto.timingSafeEqual(derived, keyBuf);
  } catch {
    return false;
  }
}

// ============================================================
// 4. AUTHENTICATION TOKEN GENERATION
// ============================================================

export function signAuthToken(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error('Invalid authentication token payload.');
  }

  const now = Date.now();

  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + TOKEN_TTL_MS,
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

// ============================================================
// 5. AUTHENTICATION TOKEN VERIFICATION
// ============================================================

export function verifyAuthToken(token) {
  if (
    typeof token !== 'string' ||
    token.length > 8192
  ) {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 2) return null;

  const [body, signature] = parts;

  if (!body || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(body)
    .digest();

  let receivedSignature;

  try {
    receivedSignature = Buffer.from(
      signature,
      'base64url'
    );
  } catch {
    return null;
  }

  if (
    receivedSignature.length !== expectedSignature.length ||
    receivedSignature.toString('base64url') !== signature ||
    !crypto.timingSafeEqual(
      receivedSignature,
      expectedSignature
    )
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    );

    const now = Date.now();

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Number.isSafeInteger(parsed.iat) ||
      !Number.isSafeInteger(parsed.exp) ||
      parsed.iat <= 0 ||
      parsed.exp <= parsed.iat ||
      parsed.iat > now + 60000 ||
      parsed.exp <= now
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ============================================================
// 6. COOKIE PARSING
// ============================================================

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const result = {};

  if (!header) return result;

  for (const part of header.split(';')) {
    const idx = part.indexOf('=');

    if (idx === -1) continue;

    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();

    if (!key) continue;

    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }

  return result;
}

// ============================================================
// 7. COOKIE SIGNING
// ============================================================

export function signCookieValue(value) {
  if (typeof value !== 'string' || !value) {
    throw new Error('Invalid cookie value.');
  }

  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(value)
    .digest('base64url');

  return `${value}.${signature}`;
}

export function verifyCookieValue(signed) {
  if (
    typeof signed !== 'string' ||
    signed.length > 4096
  ) {
    return null;
  }

  const dot = signed.lastIndexOf('.');

  if (dot <= 0) return null;

  const value = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);

  if (!value || !signature) return null;

  const expected = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(value)
    .digest();

  const received = Buffer.from(signature, 'base64url');

  if (
    received.length !== expected.length ||
    received.toString('base64url') !== signature ||
    !crypto.timingSafeEqual(received, expected)
  ) {
    return null;
  }

  return value;
}

// ============================================================
// 8. ROTATING QR TOKEN GENERATION
// ============================================================

export function getSessionQrToken(session, nowMs = Date.now()) {
  if (
    !session ||
    typeof session.id !== 'string' ||
    typeof session.secret !== 'string' ||
    session.secret.length < 32 ||
    !Number.isFinite(nowMs)
  ) {
    throw new Error('Invalid QR session configuration.');
  }

  const rawInterval = Number(session.rotateIntervalSec);

  const intervalSec =
    rawInterval >= 3 && rawInterval <= 15
      ? rawInterval
      : 5;

  const intervalMs = intervalSec * 1000;

  const slice = Math.floor(nowMs / intervalMs);

  const hmac = crypto
    .createHmac('sha256', session.secret)
    .update(`${session.id}:${slice}:qr-v2`)
    .digest('base64url');

  const token = hmac.slice(0, 18);

  const expiresAt = (slice + 1) * intervalMs;

  return {
    token,
    slice,
    intervalSec,
    expiresAt,
    remainingMs: Math.max(0, expiresAt - nowMs),
    serverTime: nowMs,
  };
}

// ============================================================
// 9. QR TOKEN VALIDATION
// ============================================================

export function validateSessionToken(
  session,
  token,
  nowMs = Date.now()
) {
  if (
    !session ||
    typeof session.id !== 'string' ||
    typeof session.secret !== 'string' ||
    session.secret.length < 32 ||
    !Number.isFinite(nowMs)
  ) {
    return {
      valid: false,
      reason: 'INVALID_SESSION',
    };
  }

  const normalizedToken =
    typeof token === 'string' ? token.trim() : '';

  if (!normalizedToken) {
    return {
      valid: false,
      reason: 'MISSING_TOKEN',
    };
  }

  if (!/^[A-Za-z0-9_-]{18}$/.test(normalizedToken)) {
    return {
      valid: false,
      reason: 'EXPIRED_OR_INVALID_TOKEN',
    };
  }

  const rawInterval = Number(session.rotateIntervalSec);

  const intervalSec =
    rawInterval >= 3 && rawInterval <= 15
      ? rawInterval
      : 5;

  const intervalMs = intervalSec * 1000;

  const currentSlice = Math.floor(nowMs / intervalMs);

  const elapsed =
    nowMs - currentSlice * intervalMs;

  const slicesToCheck = [currentSlice];

  if (
    elapsed <= PREVIOUS_SLICE_GRACE_MS &&
    currentSlice > 0
  ) {
    slicesToCheck.push(currentSlice - 1);
  }

  const received = Buffer.from(normalizedToken);

  for (const slice of slicesToCheck) {
    const refTime = slice * intervalMs + 10;

    const expected = getSessionQrToken(session, refTime);

    const expectedBuffer = Buffer.from(expected.token);

    if (
      received.length === expectedBuffer.length &&
      crypto.timingSafeEqual(received, expectedBuffer)
    ) {
      return {
        valid: true,
        method: 'qr',
        slice,
      };
    }
  }

  return {
    valid: false,
    reason: 'EXPIRED_OR_INVALID_TOKEN',
  };
}

// ============================================================
// 10. CLAIM TICKET CREATION
// ============================================================

export function createClaimTicket({
  sessionId,
  deviceCookieId,
  deviceId,
}) {
  if (
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof deviceCookieId !== 'string' ||
    !deviceCookieId
  ) {
    throw new Error('Invalid claim ticket configuration.');
  }

  cleanupExpiredTickets();

  const ticketId = `tkt_${crypto
    .randomBytes(16)
    .toString('base64url')}`;

  const now = Date.now();

  const ticket = {
    ticketId,
    sessionId,
    deviceCookieId,
    deviceId:
      typeof deviceId === 'string' ? deviceId : '',
    createdAt: now,
    expiresAt: now + CLAIM_TICKET_TTL_MS,
    used: false,
  };

  claimTickets.set(ticketId, ticket);

  return ticket;
}

// ============================================================
// 11. CLAIM TICKET VERIFICATION
// ============================================================

export function verifyClaimTicket({
  ticketId,
  deviceCookieId,
  deviceId,
}) {
  cleanupExpiredTickets();

  if (
    typeof ticketId !== 'string' ||
    !/^tkt_[A-Za-z0-9_-]{22}$/.test(ticketId)
  ) {
    return {
      valid: false,
      error: 'Missing classroom scan verification. Please scan the live QR code in class.',
      code: 'NO_TICKET',
    };
  }

  const ticket = claimTickets.get(ticketId);

  if (!ticket) {
    return {
      valid: false,
      error: 'Scan session expired. Please scan the live QR code on the screen again.',
      code: 'TICKET_EXPIRED',
    };
  }

  if (ticket.used) {
    return {
      valid: false,
      error: 'This QR scan has already been used.',
      code: 'TICKET_USED',
    };
  }

  if (Date.now() > ticket.expiresAt) {
    claimTickets.delete(ticketId);

    return {
      valid: false,
      error: 'Check-in window timed out. Please scan the live QR code again.',
      code: 'TICKET_EXPIRED',
    };
  }

  if (
    typeof deviceCookieId !== 'string' ||
    !deviceCookieId ||
    ticket.deviceCookieId !== deviceCookieId
  ) {
    return {
      valid: false,
      error: 'Device verification failed. Please scan the live QR code on your own device.',
      code: 'DEVICE_MISMATCH',
    };
  }

  if (
    ticket.deviceId &&
    (
      typeof deviceId !== 'string' ||
      ticket.deviceId !== deviceId
    )
  ) {
    return {
      valid: false,
      error: 'Device verification mismatch. Please scan the live QR code directly on your own phone.',
      code: 'DEVICE_MISMATCH',
    };
  }

  return {
    valid: true,
    ticket,
  };
}

// ============================================================
// 12. CLAIM TICKET CONSUMPTION
// ============================================================

export function burnClaimTicket(ticketId) {
  const ticket = claimTickets.get(ticketId);

  if (!ticket || ticket.used) {
    return false;
  }

  ticket.used = true;

  return true;
}

// ============================================================
// 13. EXPIRED TICKET CLEANUP
// ============================================================

function cleanupExpiredTickets() {
  const now = Date.now();

  for (const [id, ticket] of claimTickets.entries()) {
    if (now > ticket.expiresAt + 60000) {
      claimTickets.delete(id);
    }
  }
}
