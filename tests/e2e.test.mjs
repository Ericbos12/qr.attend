import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 3099;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

const DB_PATH = path.join(ROOT, 'server', 'data', 'attendance.json');
const DB_BACKUP = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH, 'utf8') : null;

function extractCookies(res) {
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const jar = {};
  for (const raw of setCookie) {
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > 0) {
      jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function apiFetch(urlPath, { method = 'GET', token, body, cookies, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (body !== undefined) reqHeaders['Content-Type'] = 'application/json';
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  if (cookies && Object.keys(cookies).length > 0) {
    reqHeaders.Cookie = cookieHeader(cookies);
  }
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: res.status,
    json,
    text,
    cookies: extractCookies(res),
    headers: res.headers,
  };
}

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not start in time');
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: err.message });
    console.error(`  FAIL  ${name}\n        -> ${err.message}`);
  }
}

console.log('\n==============================================================');
console.log('  AttendQR End-to-End Automated Test Suite');
console.log('==============================================================\n');

const serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverStderr = '';
serverProc.stderr.on('data', (d) => {
  serverStderr += d.toString();
});

try {
  await waitForServer();

  let teacherToken = '';
  let savedCourseId = '';
  let sessionId = '';
  let student1Cookies = {};
  let student1TicketId = '';

  await test('1. Built frontend HTML and health endpoint respond cleanly', async () => {
    const r = await apiFetch('/');
    assert.equal(r.status, 200);
    assert.match(r.text, /AttendQR/i);
    assert.match(r.text, /IBM\+Plex\+Sans/i);
    const h = await apiFetch('/api/health');
    assert.equal(h.status, 200);
    assert.equal(h.json.ok, true);
  });

  await test('2. Teacher Administrator registers & logs in with admin role', async () => {
    const email = `prof.test.${Date.now()}@university.edu`;
    const r = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: { name: 'Dr. Grace Mensah', email, password: 'securepassword123' },
    });
    assert.equal(r.status, 201);
    assert.ok(r.json.token);
    assert.equal(r.json.teacher.role, 'admin');
    teacherToken = r.json.token;

    const login = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'securepassword123' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.teacher.name, 'Dr. Grace Mensah');
  });

  await test('3. Teacher Admin saves and edits Course Code (no pre-loaded students)', async () => {
    const create = await apiFetch('/api/classes', {
      method: 'POST',
      token: teacherToken,
      body: { code: 'CSC 301', name: 'Operating Systems', room: 'Lab 4' },
    });
    assert.equal(create.status, 201);
    assert.equal(create.json.class.code, 'CSC 301');
    savedCourseId = create.json.class.id;

    const edit = await apiFetch(`/api/classes/${savedCourseId}`, {
      method: 'PATCH',
      token: teacherToken,
      body: { room: 'Engineering Hall 202' },
    });
    assert.equal(edit.status, 200);
    assert.equal(edit.json.class.room, 'Engineering Hall 202');
  });

  await test('4. Teacher launches rotating QR session (no Wi-Fi lock, no shareable 6-char code)', async () => {
    const res = await apiFetch('/api/sessions', {
      method: 'POST',
      token: teacherToken,
      body: {
        classId: savedCourseId,
        title: 'CSC 301 — Week 5 Lecture',
        rotateIntervalSec: 3,
        preventDuplicateDevice: true,
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.session.status, 'active');
    sessionId = res.json.session.id;

    const detail = await apiFetch(`/api/sessions/${sessionId}`, { token: teacherToken });
    assert.equal(detail.status, 200);
    assert.equal(detail.json.records.length, 0);
    assert.ok(detail.json.qr.token);
    assert.equal(detail.json.qr.shortCode, undefined);
  });

  await test('5. Student scans live QR over any network (mobile data/hosted IP) & submits Student ID + Name', async () => {
    const qrRes = await apiFetch(`/api/sessions/${sessionId}/qr`, { token: teacherToken });
    const claim = await apiFetch('/api/public/claim', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '198.51.100.42' }, // Public cellular IP works when hosted
      body: { sessionId, token: qrRes.json.qr.token, deviceId: 'dev_student_phone_1' },
    });
    assert.equal(claim.status, 200);
    assert.ok(claim.json.ticketId);
    assert.ok(claim.cookies.attendqr_dev);
    student1Cookies = claim.cookies;
    student1TicketId = claim.json.ticketId;

    const checkin = await apiFetch('/api/public/checkin', {
      method: 'POST',
      cookies: student1Cookies,
      body: {
        ticketId: student1TicketId,
        studentId: 'STU-2026-101',
        studentName: 'Ama Osei',
        deviceId: 'dev_student_phone_1',
      },
    });
    assert.equal(checkin.status, 201);
    assert.equal(checkin.json.record.studentId, 'STU-2026-101');
    assert.equal(checkin.json.record.studentName, 'Ama Osei');
  });

  await test('6. ANTI-SHARE: Direct link / missing QR token is BLOCKED', async () => {
    const claim = await apiFetch('/api/public/claim', {
      method: 'POST',
      body: { sessionId, deviceId: 'dev_outsider' },
    });
    assert.equal(claim.status, 400);
    assert.equal(claim.json.code, 'QR_REQUIRED');

    const directSubmit = await apiFetch('/api/public/checkin', {
      method: 'POST',
      body: { studentId: 'STU-999', studentName: 'Outsider', deviceId: 'dev_outsider' },
    });
    assert.equal(directSubmit.status, 403);
    assert.equal(directSubmit.json.code, 'NO_TICKET');
  });

  await test('7. ANTI-LINK-SHARE: Forwarding a claimed ticket to another phone is BLOCKED', async () => {
    const qrRes = await apiFetch(`/api/sessions/${sessionId}/qr`, { token: teacherToken });
    const claim = await apiFetch('/api/public/claim', {
      method: 'POST',
      body: { sessionId, token: qrRes.json.qr.token, deviceId: 'dev_phone_A' },
    });
    assert.equal(claim.status, 200);

    const stolen = await apiFetch('/api/public/checkin', {
      method: 'POST',
      body: {
        ticketId: claim.json.ticketId,
        studentId: 'STU-2026-999',
        studentName: 'Absent Friend',
        deviceId: 'dev_phone_B',
      },
    });
    assert.equal(stolen.status, 403);
    assert.equal(stolen.json.code, 'DEVICE_MISMATCH');
  });

  await test('8. ANTI-REPLAY: Reusing an already-submitted ticket is BLOCKED', async () => {
    const replay = await apiFetch('/api/public/checkin', {
      method: 'POST',
      cookies: student1Cookies,
      body: {
        ticketId: student1TicketId,
        studentId: 'STU-2026-202',
        studentName: 'Second Student',
        deviceId: 'dev_student_phone_1',
      },
    });
    assert.equal(replay.status, 403);
    assert.equal(replay.json.code, 'TICKET_USED');
  });

  await test('9. ANTI-PROXY: Same phone trying to check in an absent friend (even clearing localStorage) is BLOCKED', async () => {
    const qrRes = await apiFetch(`/api/sessions/${sessionId}/qr`, { token: teacherToken });
    const proxyAttempt = await apiFetch('/api/public/claim', {
      method: 'POST',
      cookies: student1Cookies,
      body: {
        sessionId,
        token: qrRes.json.qr.token,
        deviceId: 'dev_cleared_localstorage',
      },
    });
    assert.equal(proxyAttempt.status, 409);
    assert.equal(proxyAttempt.json.code, 'DEVICE_ALREADY_USED');
  });

  await test('10. ANTI-SCREENSHOT: Old QR token expires automatically after rotation + grace window', async () => {
    const qrRes = await apiFetch(`/api/sessions/${sessionId}/qr`, { token: teacherToken });
    const screenshotToken = qrRes.json.qr.token;

    await new Promise((r) => setTimeout(r, 6200));

    const staleAttempt = await apiFetch('/api/public/claim', {
      method: 'POST',
      body: { sessionId, token: screenshotToken, deviceId: 'dev_screenshot_recipient' },
    });
    assert.equal(staleAttempt.status, 403);
    assert.equal(staleAttempt.json.code, 'QR_EXPIRED');
  });

  await test('11. Second student checks in & CSV export contains both students', async () => {
    const qrRes = await apiFetch(`/api/sessions/${sessionId}/qr`, { token: teacherToken });
    const claim = await apiFetch('/api/public/claim', {
      method: 'POST',
      body: { sessionId, token: qrRes.json.qr.token, deviceId: 'dev_student_phone_2' },
    });
    assert.equal(claim.status, 200);

    const checkin = await apiFetch('/api/public/checkin', {
      method: 'POST',
      cookies: claim.cookies,
      body: {
        ticketId: claim.json.ticketId,
        studentId: 'STU-2026-102',
        studentName: 'Kwame Boateng',
        deviceId: 'dev_student_phone_2',
      },
    });
    assert.equal(checkin.status, 201);

    const csv = await apiFetch(`/api/sessions/${sessionId}/export.csv`, { token: teacherToken });
    assert.equal(csv.status, 200);
    assert.match(csv.text, /STU-2026-101/);
    assert.match(csv.text, /Ama Osei/);
    assert.match(csv.text, /STU-2026-102/);
    assert.match(csv.text, /Kwame Boateng/);
  });

  await test('12. Optional GPS Geofence blocks remote student (500m away) and allows in-class student (5m away)', async () => {
    const geoSess = await apiFetch('/api/sessions', {
      method: 'POST',
      token: teacherToken,
      body: {
        classId: savedCourseId,
        title: 'CSC 301 — GPS Locked Lab',
        rotateIntervalSec: 5,
        geoLock: { lat: 5.6508, lng: -0.1869, radiusMeters: 75 },
      },
    });
    assert.equal(geoSess.status, 201);
    const geoId = geoSess.json.session.id;

    const qrRes = await apiFetch(`/api/sessions/${geoId}/qr`, { token: teacherToken });
    const claim1 = await apiFetch('/api/public/claim', {
      method: 'POST',
      body: { sessionId: geoId, token: qrRes.json.qr.token, deviceId: 'dev_gps_student' },
    });
    assert.equal(claim1.status, 200);

    const farSubmit = await apiFetch('/api/public/checkin', {
      method: 'POST',
      cookies: claim1.cookies,
      body: {
        ticketId: claim1.json.ticketId,
        studentId: 'STU-FAR',
        studentName: 'Remote Student',
        deviceId: 'dev_gps_student',
        coords: { lat: 5.6555, lng: -0.1869 },
      },
    });
    assert.equal(farSubmit.status, 403);
    assert.equal(farSubmit.json.code, 'OUTSIDE_CLASSROOM_GPS');

    const nearSubmit = await apiFetch('/api/public/checkin', {
      method: 'POST',
      cookies: claim1.cookies,
      body: {
        ticketId: claim1.json.ticketId,
        studentId: 'STU-NEAR',
        studentName: 'Present Student',
        deviceId: 'dev_gps_student',
        coords: { lat: 5.65084, lng: -0.18691 },
      },
    });
    assert.equal(nearSubmit.status, 201);
  });

  await test('13. Network info endpoint returns local port and LAN origin for QR codes', async () => {
    const net = await apiFetch('/api/network-info', { token: teacherToken });
    assert.equal(net.status, 200);
    assert.equal(net.json.port, TEST_PORT);
    assert.ok(net.json.preferredOrigin === null || typeof net.json.preferredOrigin === 'string');
  });
} finally {
  serverProc.kill();
  if (DB_BACKUP !== null) {
    fs.writeFileSync(DB_PATH, DB_BACKUP, 'utf8');
  } else if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
}

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log('\n==============================================================');
console.log(`  RESULT: ${passed}/${results.length} tests passed (${failed} failed)`);
console.log('==============================================================\n');

if (serverStderr.trim()) {
  console.error('Server stderr:', serverStderr);
}
if (failed > 0) {
  process.exit(1);
}
