import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
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
import { getClientIp, haversineDistanceMeters, getLanAddresses } from './network.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DEVICE_COOKIE_NAME = 'attendqr_dev';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

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

// Auth middleware for Teacher Administrator routes
function requireTeacher(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const queryToken = req.query.auth || null;
  const token = bearer || queryToken;
  const payload = verifyAuthToken(token);
  if (!payload?.teacherId) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  const teacher = store.findTeacherById(payload.teacherId);
  if (!teacher) {
    return res.status(401).json({ error: 'Account not found. Please sign in again.' });
  }
  req.teacher = teacher;
  next();
}

function sanitizeTeacher(teacher) {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    role: teacher.role || 'admin',
  };
}

function sanitizeSession(session) {
  const cls = store.getClassById(session.classId);
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
  res.json({ ok: true, time: new Date().toISOString() });
});

// Silent LAN IP helper so local QR codes work on Wi-Fi without extra UI
app.get('/api/network-info', requireTeacher, (_req, res) => {
  const lanAddresses = getLanAddresses();
  const preferredOrigin = lanAddresses[0] ? `http://${lanAddresses[0].address}:${PORT}` : null;
  res.json({ port: PORT, preferredOrigin });
});

// ==========================================
// TEACHER ADMINISTRATOR AUTH ROUTES
// ==========================================
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || password.length < 4) {
    return res.status(400).json({ error: 'Please provide your name, email, and a password (minimum 4 characters).' });
  }
  if (store.findTeacherByEmail(email)) {
    return res.status(409).json({ error: 'An administrator account with this email already exists.' });
  }
  const teacher = store.createTeacher({ name, email, password });
  const token = signAuthToken({ teacherId: teacher.id });
  res.status(201).json({ token, teacher: sanitizeTeacher(teacher) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const teacher = store.findTeacherByEmail(email);
  if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = signAuthToken({ teacherId: teacher.id });
  res.json({ token, teacher: sanitizeTeacher(teacher) });
});

app.get('/api/auth/me', requireTeacher, (req, res) => {
  res.json({ teacher: sanitizeTeacher(req.teacher) });
});

// ==========================================
// SAVED COURSE CODES / CLASSES ROUTES
// ==========================================
app.get('/api/classes', requireTeacher, (req, res) => {
  res.json({ classes: store.getClassesByTeacher(req.teacher.id) });
});

app.post('/api/classes', requireTeacher, (req, res) => {
  const { code, name, room } = req.body || {};
  if (!code?.trim() || !name?.trim()) {
    return res.status(400).json({ error: 'Course code and course title are required.' });
  }
  const cls = store.createClass({
    teacherId: req.teacher.id,
    code,
    name,
    room,
  });
  res.status(201).json({ class: cls });
});

app.patch('/api/classes/:id', requireTeacher, (req, res) => {
  const cls = store.getClassById(req.params.id);
  if (!cls || cls.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Course not found.' });
  }
  const { code, name, room } = req.body || {};
  const updated = store.updateClass(cls.id, { code, name, room });
  res.json({ class: updated });
});

app.delete('/api/classes/:id', requireTeacher, (req, res) => {
  const cls = store.getClassById(req.params.id);
  if (!cls || cls.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Course not found.' });
  }
  store.deleteClass(cls.id);
  res.json({ ok: true });
});

// ==========================================
// SESSIONS ROUTES (Teacher Administrator)
// ==========================================
app.get('/api/sessions', requireTeacher, (req, res) => {
  const classId = req.query.classId || null;
  const sessions = store.getSessionsByTeacher(req.teacher.id, classId).map(({ secret, ...rest }) => rest);
  res.json({ sessions });
});

app.post('/api/sessions', requireTeacher, (req, res) => {
  const {
    classId,
    title,
    room,
    rotateIntervalSec = 5,
    preventDuplicateDevice = true,
    geoLock = null,
  } = req.body || {};
  const cls = store.getClassById(classId);
  if (!cls || cls.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Course not found.' });
  }
  const session = store.createSession({
    teacherId: req.teacher.id,
    classId,
    title,
    room,
    rotateIntervalSec,
    preventDuplicateDevice,
    geoLock,
  });
  res.status(201).json({ session: sanitizeSession(session) });
});

app.get('/api/sessions/:id', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session || session.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const records = store.getRecordsBySession(session.id).map(sanitizeRecord);
  const qr = getSessionQrToken(session);
  res.json({
    session: sanitizeSession(session),
    records,
    qr,
  });
});

app.get('/api/sessions/:id/qr', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session || session.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const qr = getSessionQrToken(session);
  res.json({
    status: session.status,
    qr,
  });
});

app.patch('/api/sessions/:id', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session || session.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const updated = store.updateSession(session.id, req.body || {});
  const safe = sanitizeSession(updated);
  broadcastSessionEvent(session.id, 'session_update', safe);
  res.json({ session: safe });
});

app.delete('/api/sessions/:id', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session || session.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  store.deleteSession(session.id);
  res.json({ ok: true });
});

// Live SSE stream for real-time attendance feed
app.get('/api/sessions/:id/stream', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
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
});

// Teacher manual check-in (for a student physically in class without a phone)
app.post('/api/sessions/:id/manual-checkin', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session || session.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const { studentId, studentName, note } = req.body || {};
  if (!studentId?.trim() || !studentName?.trim()) {
    return res.status(400).json({ error: 'Student ID and full name are required.' });
  }
  const result = store.addRecord({
    sessionId: session.id,
    studentId,
    studentName,
    note,
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
});

app.delete('/api/sessions/:id/records/:recordId', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session || session.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const removed = store.removeRecord(req.params.recordId, session.id);
  if (!removed) {
    return res.status(404).json({ error: 'Record not found.' });
  }
  broadcastSessionEvent(session.id, 'record_removed', { recordId: req.params.recordId });
  res.json({ ok: true });
});

// Export CSV for a session
app.get('/api/sessions/:id/export.csv', requireTeacher, (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session || session.teacherId !== req.teacher.id) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const cls = store.getClassById(session.classId);
  const records = store.getRecordsBySession(session.id).reverse();

  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [
    ['Course Code', 'Course Title', 'Session', 'Room', 'Student ID', 'Student Name', 'Method', 'Time Recorded', 'Note'],
    ...records.map((r) => [
      cls?.code || '',
      cls?.name || '',
      session.title,
      session.room || cls?.room || '',
      r.studentId,
      r.studentName,
      r.method,
      new Date(r.checkedInAt).toLocaleString(),
      r.note || '',
    ]),
  ];

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const safeName = `${(cls?.code || 'attendance').replace(/[^a-zA-Z0-9_-]/g, '_')}_${session.startedAt.slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send('\uFEFF' + csv);
});

// ==========================================
// PUBLIC STUDENT QR SCAN & ANTI-SHARE ROUTES
// ==========================================

/**
 * Step 1: Student scans the live rotating QR code in class.
 * Exchanges the short-lived rotating token for a single-use, device-bound claim ticket
 * tied to an HttpOnly SameSite=Strict cookie so the URL token can be wiped immediately.
 */
app.post('/api/public/claim', (req, res) => {
  const { sessionId, token, deviceId } = req.body || {};

  if (!sessionId || !token) {
    return res.status(400).json({
      error: 'Direct link access is not permitted. Scan the live QR code displayed in class.',
      code: 'QR_REQUIRED',
    });
  }

  const session = store.getSessionById(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Attendance session not found.', code: 'SESSION_NOT_FOUND' });
  }
  if (session.status === 'paused') {
    return res.status(403).json({ error: 'Attendance is currently paused by the instructor.', code: 'SESSION_PAUSED' });
  }
  if (session.status === 'ended') {
    return res.status(403).json({ error: 'This attendance session has closed.', code: 'SESSION_ENDED' });
  }

  // Verify live rotating QR token (screenshots & forwarded links expire within seconds)
  const validation = validateSessionToken(session, token);
  if (!validation.valid) {
    return res.status(403).json({
      error: 'This QR code has expired. Screenshots and forwarded links cannot be used — scan the live code on screen.',
      code: 'QR_EXPIRED',
    });
  }

  const deviceCookieId = getOrAssignDeviceCookie(req, res);

  if (session.preventDuplicateDevice) {
    const existingDevice = store.findDeviceRecordInSession(session.id, {
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

  const cls = store.getClassById(session.classId);
  const teacher = store.findTeacherById(session.teacherId);

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
      geoLockRequired: Boolean(session.geoLock),
      geoRadiusMeters: session.geoLock?.radiusMeters || null,
    },
  });
});

/**
 * Step 2: Student submits Student ID and Full Name using their verified single-use ticket.
 */
app.post('/api/public/checkin', (req, res) => {
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
  const session = store.getSessionById(ticket.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Attendance session not found.' });
  }
  if (session.status === 'paused') {
    return res.status(403).json({ error: 'Attendance is currently paused by the instructor.' });
  }
  if (session.status === 'ended') {
    return res.status(403).json({ error: 'This attendance session has closed.' });
  }

  // Optional Classroom GPS Geofence check
  if (session.geoLock) {
    const lat = Number(coords?.lat);
    const lng = Number(coords?.lng);
    if (!coords || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(403).json({
        error: 'Location verification is required for this session. Allow location access in your browser and retry.',
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

  const result = store.addRecord({
    sessionId: session.id,
    studentId,
    studentName,
    deviceId: deviceId || '',
    deviceCookieId: deviceCookieId || '',
    clientIp: getClientIp(req),
    method: 'qr',
  });

  const cls = store.getClassById(session.classId);

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
    message: 'Your attendance has been recorded.',
    record: safeRecord,
    classInfo: {
      code: cls?.code || '',
      name: cls?.name || '',
      title: session.title,
    },
  });
});

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

app.listen(PORT, '0.0.0.0', () => {
  const lan = getLanAddresses();
  console.log(`\nAttendQR server listening on:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  if (lan.length > 0) {
    console.log(`  Network: http://${lan[0].address}:${PORT}  (phones on the same Wi-Fi)`);
  }
  console.log('');
});
