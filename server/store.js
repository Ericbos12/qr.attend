import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'attendance.json');

function createInitialData() {
  const teacherId = 'teacher_demo';
  const class1Id = 'class_cs101';
  const class2Id = 'class_math204';

  return {
    teachers: [
      {
        id: teacherId,
        name: 'Prof. Alex Rivera',
        email: 'demo@school.edu',
        role: 'admin',
        passwordHash: hashPassword('teacher123'),
        createdAt: new Date().toISOString(),
      },
    ],
    classes: [
      {
        id: class1Id,
        teacherId,
        code: 'CS 101',
        name: 'Introduction to Computer Science',
        room: 'Hall A — Room 204',
        createdAt: new Date().toISOString(),
      },
      {
        id: class2Id,
        teacherId,
        code: 'MATH 204',
        name: 'Linear Algebra & Applications',
        room: 'Science Bldg — Room 112',
        createdAt: new Date().toISOString(),
      },
    ],
    sessions: [],
    records: [],
  };
}

let db = null;

function loadDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    db = createInitialData();
    saveDb();
    return db;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    db = JSON.parse(raw);
    db.teachers ||= [];
    db.classes ||= [];
    db.sessions ||= [];
    db.records ||= [];
    for (const t of db.teachers) {
      t.role ||= 'admin';
    }
  } catch {
    db = createInitialData();
    saveDb();
  }
  return db;
}

function saveDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

loadDb();

export const store = {
  // Teacher Administrator Accounts
  findTeacherByEmail(email) {
    return db.teachers.find((t) => t.email.toLowerCase() === email.trim().toLowerCase());
  },
  findTeacherById(id) {
    return db.teachers.find((t) => t.id === id);
  },
  createTeacher({ name, email, password }) {
    const teacher = {
      id: `teacher_${crypto.randomBytes(6).toString('hex')}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'admin',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.teachers.push(teacher);
    saveDb();
    return teacher;
  },

  // Classes / Saved Course Codes
  getClassesByTeacher(teacherId) {
    return db.classes
      .filter((c) => c.teacherId === teacherId)
      .map((c) => {
        const sessions = db.sessions.filter((s) => s.classId === c.id);
        const activeSession = sessions.find((s) => s.status === 'active' || s.status === 'paused') || null;
        const totalCheckIns = db.records.filter((r) => sessions.some((s) => s.id === r.sessionId)).length;
        return {
          ...c,
          sessionCount: sessions.length,
          totalCheckIns,
          activeSessionId: activeSession?.id || null,
          activeSessionStatus: activeSession?.status || null,
        };
      });
  },
  getClassById(id) {
    return db.classes.find((c) => c.id === id);
  },
  createClass({ teacherId, code, name, room }) {
    const cls = {
      id: `class_${crypto.randomBytes(6).toString('hex')}`,
      teacherId,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      room: (room || '').trim(),
      createdAt: new Date().toISOString(),
    };
    db.classes.unshift(cls);
    saveDb();
    return cls;
  },
  updateClass(classId, { code, name, room }) {
    const cls = db.classes.find((c) => c.id === classId);
    if (!cls) return null;
    if (code !== undefined && code.trim()) cls.code = code.trim().toUpperCase();
    if (name !== undefined && name.trim()) cls.name = name.trim();
    if (room !== undefined) cls.room = room.trim();
    saveDb();
    return cls;
  },
  deleteClass(classId) {
    const sessionIds = new Set(db.sessions.filter((s) => s.classId === classId).map((s) => s.id));
    db.classes = db.classes.filter((c) => c.id !== classId);
    db.sessions = db.sessions.filter((s) => s.classId !== classId);
    db.records = db.records.filter((r) => !sessionIds.has(r.sessionId));
    saveDb();
  },

  // Sessions
  getSessionsByTeacher(teacherId, classId = null) {
    return db.sessions
      .filter((s) => s.teacherId === teacherId && (!classId || s.classId === classId))
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .map((s) => {
        const cls = db.classes.find((c) => c.id === s.classId);
        const attendeeCount = db.records.filter((r) => r.sessionId === s.id).length;
        return {
          ...s,
          className: cls?.name || 'Unknown Course',
          classCode: cls?.code || '',
          room: s.room || cls?.room || '',
          attendeeCount,
        };
      });
  },
  getSessionById(id) {
    return db.sessions.find((s) => s.id === id);
  },
  getActiveSessions() {
    return db.sessions.filter((s) => s.status === 'active');
  },
  createSession({
    teacherId,
    classId,
    title,
    room,
    rotateIntervalSec = 5,
    preventDuplicateDevice = true,
    geoLock = null,
  }) {
    for (const s of db.sessions) {
      if (s.classId === classId && (s.status === 'active' || s.status === 'paused')) {
        s.status = 'ended';
        s.endedAt = new Date().toISOString();
      }
    }
    const cls = db.classes.find((c) => c.id === classId);
    const safeInterval = Math.min(15, Math.max(3, Number(rotateIntervalSec) || 5));

    const safeGeo =
      geoLock &&
      typeof geoLock.lat === 'number' &&
      typeof geoLock.lng === 'number' &&
      !Number.isNaN(geoLock.lat) &&
      !Number.isNaN(geoLock.lng)
        ? {
            lat: geoLock.lat,
            lng: geoLock.lng,
            radiusMeters: Math.min(500, Math.max(25, Number(geoLock.radiusMeters) || 75)),
          }
        : null;

    const session = {
      id: `sess_${crypto.randomBytes(5).toString('hex')}`,
      teacherId,
      classId,
      title: (title || '').trim() || `${cls?.code || 'Class'} Lecture`,
      room: (room || '').trim() || cls?.room || '',
      secret: crypto.randomBytes(24).toString('hex'),
      rotateIntervalSec: safeInterval,
      preventDuplicateDevice: Boolean(preventDuplicateDevice),
      geoLock: safeGeo,
      status: 'active',
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    db.sessions.unshift(session);
    saveDb();
    return session;
  },
  updateSession(id, updates) {
    const session = db.sessions.find((s) => s.id === id);
    if (!session) return null;
    if (updates.status !== undefined) {
      session.status = updates.status;
      if (updates.status === 'ended' && !session.endedAt) {
        session.endedAt = new Date().toISOString();
      }
      if (updates.status === 'active') {
        session.endedAt = null;
      }
    }
    if (updates.rotateIntervalSec !== undefined) {
      session.rotateIntervalSec = Math.min(15, Math.max(3, Number(updates.rotateIntervalSec) || 5));
    }
    if (updates.preventDuplicateDevice !== undefined) {
      session.preventDuplicateDevice = Boolean(updates.preventDuplicateDevice);
    }
    if (updates.title !== undefined) {
      session.title = updates.title.trim();
    }
    saveDb();
    return session;
  },
  deleteSession(id) {
    db.sessions = db.sessions.filter((s) => s.id !== id);
    db.records = db.records.filter((r) => r.sessionId !== id);
    saveDb();
  },

  // Attendance records
  getRecordsBySession(sessionId) {
    return db.records
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => new Date(b.checkedInAt) - new Date(a.checkedInAt));
  },
  findDeviceRecordInSession(sessionId, { deviceId = '', deviceCookieId = '' }) {
    return (
      db.records.find(
        (r) =>
          r.sessionId === sessionId &&
          r.method !== 'manual' &&
          ((deviceId && r.deviceId && r.deviceId === deviceId) ||
            (deviceCookieId && r.deviceCookieId && r.deviceCookieId === deviceCookieId))
      ) || null
    );
  },
  addRecord({
    sessionId,
    studentId,
    studentName,
    deviceId = '',
    deviceCookieId = '',
    clientIp = '',
    method = 'qr',
    note = '',
  }) {
    const normalizedId = studentId.trim().toUpperCase();
    const existingStudent = db.records.find(
      (r) => r.sessionId === sessionId && r.studentId.toUpperCase() === normalizedId
    );
    if (existingStudent) {
      return { error: 'ALREADY_CHECKED_IN', existing: existingStudent };
    }

    const session = db.sessions.find((s) => s.id === sessionId);
    if (session?.preventDuplicateDevice && method !== 'manual') {
      const existingDevice = this.findDeviceRecordInSession(sessionId, { deviceId, deviceCookieId });
      if (existingDevice) {
        return { error: 'DEVICE_ALREADY_USED', existing: existingDevice };
      }
    }

    const record = {
      id: `rec_${crypto.randomBytes(6).toString('hex')}`,
      sessionId,
      studentId: studentId.trim(),
      studentName: studentName.trim(),
      deviceId: deviceId || '',
      deviceCookieId: deviceCookieId || '',
      clientIp: clientIp || '',
      method,
      note: (note || '').trim(),
      checkedInAt: new Date().toISOString(),
    };
    db.records.unshift(record);
    saveDb();
    return { record };
  },
  removeRecord(recordId, sessionId) {
    const before = db.records.length;
    db.records = db.records.filter((r) => !(r.id === recordId && r.sessionId === sessionId));
    const removed = db.records.length < before;
    if (removed) saveDb();
    return removed;
  },
};
