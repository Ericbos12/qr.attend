import fs from 'node:fs';
import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { initDatabase, getDb, getLegacyJsonPath } from './db.js';

const RESET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RESET_TTL_MS = 15 * 60 * 1000;

function mapTeacher(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || 'admin',
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

function mapClass(row) {
  if (!row) return null;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    code: row.code,
    name: row.name,
    room: row.room || '',
    createdAt: row.created_at,
  };
}

function mapSession(row) {
  if (!row) return null;
  const hasGeo = row.geo_lat !== null && row.geo_lat !== undefined && row.geo_lng !== null && row.geo_lng !== undefined;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    classId: row.class_id,
    title: row.title,
    room: row.room || '',
    secret: row.secret,
    rotateIntervalSec: Number(row.rotate_interval_sec) || 8,
    preventDuplicateDevice: Boolean(row.prevent_duplicate_device),
    lateAfterMinutes: row.late_after_minutes !== null && row.late_after_minutes !== undefined
      ? Number(row.late_after_minutes)
      : null,
    geoLock: hasGeo
      ? {
          lat: Number(row.geo_lat),
          lng: Number(row.geo_lng),
          radiusMeters: Number(row.geo_radius_meters) || 75,
        }
      : null,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at || null,
  };
}

function mapRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    studentName: row.student_name,
    status: row.status === 'late' ? 'late' : 'present',
    deviceId: row.device_id || '',
    deviceCookieId: row.device_cookie_id || '',
    clientIp: row.client_ip || '',
    method: row.method || 'qr',
    note: row.note || '',
    checkedInAt: row.checked_in_at,
  };
}

function hashResetCode(code) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function generateResetCode() {
  const bytes = crypto.randomBytes(12);
  let raw = '';
  for (let i = 0; i < 12; i++) {
    raw += RESET_ALPHABET[bytes[i] % RESET_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

async function migrateLegacyJsonIfAvailable(db) {
  const legacyPath = getLegacyJsonPath();
  if (!fs.existsSync(legacyPath)) return false;

  try {
    const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    const teachers = Array.isArray(parsed.teachers) ? parsed.teachers : [];
    const classes = Array.isArray(parsed.classes) ? parsed.classes : [];
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    if (teachers.length === 0) return false;

    await db.transaction(async (tx) => {
      const realTeachers = teachers.filter((t) => t.id !== 'teacher_demo' && t.email !== 'demo@school.edu');
      const allowedTeacherIds = new Set(realTeachers.map((t) => t.id));
      for (const t of realTeachers) {
        await tx.execute(
          `INSERT INTO teachers (id, name, email, role, password_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
          [
            t.id,
            t.name || 'Instructor',
            String(t.email || '').trim().toLowerCase(),
            t.role || 'admin',
            t.passwordHash,
            t.createdAt || new Date().toISOString(),
          ]
        );
      }
      const allowedClassIds = new Set();
      for (const c of classes) {
        if (!allowedTeacherIds.has(c.teacherId)) continue;
        allowedClassIds.add(c.id);
        await tx.execute(
          `INSERT INTO classes (id, teacher_id, code, name, room, created_at)
           VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
          [
            c.id,
            c.teacherId,
            String(c.code || '').trim().toUpperCase(),
            String(c.name || '').trim(),
            String(c.room || '').trim(),
            c.createdAt || new Date().toISOString(),
          ]
        );
      }
      const allowedSessionIds = new Set();
      for (const s of sessions) {
        if (!allowedTeacherIds.has(s.teacherId) || !allowedClassIds.has(s.classId)) continue;
        allowedSessionIds.add(s.id);
        const secret = typeof s.secret === 'string' && s.secret.length >= 32
          ? s.secret
          : crypto.randomBytes(24).toString('hex');
        await tx.execute(
          `INSERT INTO sessions (
             id, teacher_id, class_id, title, room, secret, rotate_interval_sec,
             prevent_duplicate_device, late_after_minutes, geo_lat, geo_lng,
             geo_radius_meters, status, started_at, ended_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO NOTHING`,
          [
            s.id,
            s.teacherId,
            s.classId,
            s.title || 'Class Session',
            s.room || '',
            secret,
            Math.min(15, Math.max(3, Number(s.rotateIntervalSec) || 8)),
            s.preventDuplicateDevice === false ? 0 : 1,
            s.lateAfterMinutes ?? null,
            s.geoLock?.lat ?? null,
            s.geoLock?.lng ?? null,
            s.geoLock?.radiusMeters ?? null,
            s.status || 'ended',
            s.startedAt || new Date().toISOString(),
            s.endedAt || null,
          ]
        );
      }
      for (const r of records) {
        if (!allowedSessionIds.has(r.sessionId)) continue;
        const studentId = String(r.studentId || '').trim();
        await tx.execute(
          `INSERT INTO records (
             id, session_id, student_id, student_id_normalized, student_name,
             status, device_id, device_cookie_id, client_ip, method, note, checked_in_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
          [
            r.id,
            r.sessionId,
            studentId,
            studentId.toUpperCase(),
            String(r.studentName || '').trim(),
            r.status === 'late' ? 'late' : 'present',
            r.deviceId || '',
            r.deviceCookieId || '',
            r.clientIp || '',
            r.method || 'qr',
            r.note || '',
            r.checkedInAt || new Date().toISOString(),
          ]
        );
      }
    });

    console.log(
      `[DB] Migrated legacy attendance.json (${teachers.length} teachers, ${classes.length} courses, ${sessions.length} sessions, ${records.length} records).`
    );
    return true;
  } catch (err) {
    console.warn('[DB] Legacy attendance.json migration skipped:', err.message);
    return false;
  }
}

export async function initStore() {
  const db = await initDatabase();
  const countRow = await db.queryOne(`SELECT COUNT(*) AS cnt FROM teachers`);
  const teacherCount = Number(countRow?.cnt || 0);

  if (
    teacherCount === 0 &&
    db.dialect === 'sqlite' &&
    process.env.NODE_ENV !== 'production' &&
    !(process.env.SQLITE_PATH || '').trim()
  ) {
    await migrateLegacyJsonIfAvailable(db);
  }
  return { dialect: db.dialect, dbPath: db.dbPath || null };
}

export const store = {
  getDialect() {
    return getDb().dialect;
  },

  // ==========================================
  // TEACHER ADMINISTRATOR ACCOUNTS
  // ==========================================
  async findTeacherByEmail(email) {
    const row = await getDb().queryOne(
      `SELECT * FROM teachers WHERE LOWER(email) = LOWER(?)`,
      [String(email || '').trim()]
    );
    return mapTeacher(row);
  },

  async findTeacherById(id) {
    const row = await getDb().queryOne(`SELECT * FROM teachers WHERE id = ?`, [id]);
    return mapTeacher(row);
  },

  async createTeacher({ name, email, password }) {
    const teacher = {
      id: `teacher_${crypto.randomBytes(6).toString('hex')}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'admin',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    await getDb().execute(
      `INSERT INTO teachers (id, name, email, role, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [teacher.id, teacher.name, teacher.email, teacher.role, teacher.passwordHash, teacher.createdAt]
    );
    return teacher;
  },

  async updateTeacherPassword(teacherId, newPassword) {
    const passwordHash = hashPassword(newPassword);
    const { changes } = await getDb().execute(
      `UPDATE teachers SET password_hash = ? WHERE id = ?`,
      [passwordHash, teacherId]
    );
    return changes > 0;
  },

  async createPasswordResetToken(teacherId) {
    const code = generateResetCode();
    const tokenHash = hashResetCode(code);
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + RESET_TTL_MS).toISOString();

    await getDb().transaction(async (tx) => {
      await tx.execute(`DELETE FROM password_resets WHERE teacher_id = ?`, [teacherId]);
      await tx.execute(
        `INSERT INTO password_resets (token_hash, teacher_id, expires_at, used_at, created_at)
         VALUES (?, ?, ?, NULL, ?)`,
        [tokenHash, teacherId, expiresAt, createdAt]
      );
    });

    return { code, expiresAt };
  },

  async consumePasswordResetToken(email, code, newPassword) {
    const teacher = await this.findTeacherByEmail(email);
    if (!teacher) {
      return { ok: false, error: 'Invalid or expired reset code.' };
    }
    const tokenHash = hashResetCode(code);
    const row = await getDb().queryOne(
      `SELECT * FROM password_resets WHERE token_hash = ? AND teacher_id = ?`,
      [tokenHash, teacher.id]
    );
    if (!row || row.used_at || Date.now() > Date.parse(row.expires_at)) {
      return { ok: false, error: 'Invalid or expired reset code.' };
    }

    const nowIso = new Date().toISOString();
    const newHash = hashPassword(newPassword);
    await getDb().transaction(async (tx) => {
      await tx.execute(
        `UPDATE password_resets SET used_at = ? WHERE token_hash = ?`,
        [nowIso, tokenHash]
      );
      await tx.execute(
        `UPDATE teachers SET password_hash = ? WHERE id = ?`,
        [newHash, teacher.id]
      );
    });

    return { ok: true, teacher };
  },

  // ==========================================
  // SAVED COURSE CODES / CLASSES
  // ==========================================
  async getClassesByTeacher(teacherId) {
    const db = getDb();
    const classes = (
      await db.query(
        `SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC`,
        [teacherId]
      )
    ).map(mapClass);

    if (classes.length === 0) return [];

    const sessions = await db.query(
      `SELECT s.id, s.class_id, s.status, s.started_at, COUNT(r.id) AS rec_count
       FROM sessions s
       LEFT JOIN records r ON r.session_id = s.id
       WHERE s.teacher_id = ?
       GROUP BY s.id, s.class_id, s.status, s.started_at
       ORDER BY s.started_at DESC`,
      [teacherId]
    );

    const byClass = new Map();
    for (const s of sessions) {
      if (!byClass.has(s.class_id)) {
        byClass.set(s.class_id, { sessionCount: 0, totalCheckIns: 0, activeSession: null });
      }
      const stat = byClass.get(s.class_id);
      stat.sessionCount += 1;
      stat.totalCheckIns += Number(s.rec_count || 0);
      if (!stat.activeSession && (s.status === 'active' || s.status === 'paused')) {
        stat.activeSession = { id: s.id, status: s.status };
      }
    }

    return classes.map((c) => {
      const stat = byClass.get(c.id);
      return {
        ...c,
        sessionCount: stat?.sessionCount || 0,
        totalCheckIns: stat?.totalCheckIns || 0,
        activeSessionId: stat?.activeSession?.id || null,
        activeSessionStatus: stat?.activeSession?.status || null,
      };
    });
  },

  async getClassById(id) {
    const row = await getDb().queryOne(`SELECT * FROM classes WHERE id = ?`, [id]);
    return mapClass(row);
  },

  async createClass({ teacherId, code, name, room }) {
    const cls = {
      id: `class_${crypto.randomBytes(6).toString('hex')}`,
      teacherId,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      room: (room || '').trim(),
      createdAt: new Date().toISOString(),
    };
    await getDb().execute(
      `INSERT INTO classes (id, teacher_id, code, name, room, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cls.id, cls.teacherId, cls.code, cls.name, cls.room, cls.createdAt]
    );
    return cls;
  },

  async updateClass(classId, { code, name, room }) {
    const existing = await this.getClassById(classId);
    if (!existing) return null;
    const nextCode = code !== undefined && code.trim() ? code.trim().toUpperCase() : existing.code;
    const nextName = name !== undefined && name.trim() ? name.trim() : existing.name;
    const nextRoom = room !== undefined ? room.trim() : existing.room;

    await getDb().execute(
      `UPDATE classes SET code = ?, name = ?, room = ? WHERE id = ?`,
      [nextCode, nextName, nextRoom, classId]
    );
    return { ...existing, code: nextCode, name: nextName, room: nextRoom };
  },

  async deleteClass(classId) {
    await getDb().execute(`DELETE FROM classes WHERE id = ?`, [classId]);
  },

  // ==========================================
  // SESSIONS
  // ==========================================
  async getSessionsByTeacher(teacherId, classId = null) {
    const params = [teacherId];
    let classFilter = '';
    if (classId) {
      classFilter = 'AND s.class_id = ?';
      params.push(classId);
    }

    const rows = await getDb().query(
      `SELECT
         s.*,
         c.code AS class_code,
         c.name AS class_name,
         c.room AS class_room,
         COUNT(r.id) AS attendee_count,
         SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS late_count
       FROM sessions s
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN records r ON r.session_id = s.id
       WHERE s.teacher_id = ? ${classFilter}
       GROUP BY s.id, c.code, c.name, c.room
       ORDER BY s.started_at DESC`,
      params
    );

    return rows.map((row) => {
      const sess = mapSession(row);
      const attendeeCount = Number(row.attendee_count || 0);
      const lateCount = Number(row.late_count || 0);
      return {
        ...sess,
        className: row.class_name || 'Unknown Course',
        classCode: row.class_code || '',
        room: sess.room || row.class_room || '',
        attendeeCount,
        lateCount,
        presentCount: Math.max(0, attendeeCount - lateCount),
      };
    });
  },

  async getSessionById(id) {
    const row = await getDb().queryOne(`SELECT * FROM sessions WHERE id = ?`, [id]);
    return mapSession(row);
  },

  async createSession({
    teacherId,
    classId,
    title,
    room,
    rotateIntervalSec = 8,
    preventDuplicateDevice = true,
    lateAfterMinutes = null,
    geoLock = null,
  }) {
    const db = getDb();
    const cls = await this.getClassById(classId);
    const safeInterval = Math.min(15, Math.max(3, Number(rotateIntervalSec) || 8));

    const parsedLate = Number(lateAfterMinutes);
    const safeLateMinutes =
      lateAfterMinutes !== null &&
      lateAfterMinutes !== '' &&
      Number.isFinite(parsedLate) &&
      parsedLate >= 1 &&
      parsedLate <= 180
        ? Math.round(parsedLate)
        : null;

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

    const nowIso = new Date().toISOString();
    const session = {
      id: `sess_${crypto.randomBytes(5).toString('hex')}`,
      teacherId,
      classId,
      title: (title || '').trim() || `${cls?.code || 'Class'} Lecture`,
      room: (room || '').trim() || cls?.room || '',
      secret: crypto.randomBytes(24).toString('hex'),
      rotateIntervalSec: safeInterval,
      preventDuplicateDevice: Boolean(preventDuplicateDevice),
      lateAfterMinutes: safeLateMinutes,
      geoLock: safeGeo,
      status: 'active',
      startedAt: nowIso,
      endedAt: null,
    };

    await db.transaction(async (tx) => {
      await tx.execute(
        `UPDATE sessions SET status = 'ended', ended_at = ?
         WHERE class_id = ? AND status IN ('active', 'paused')`,
        [nowIso, classId]
      );
      await tx.execute(
        `INSERT INTO sessions (
           id, teacher_id, class_id, title, room, secret, rotate_interval_sec,
           prevent_duplicate_device, late_after_minutes, geo_lat, geo_lng,
           geo_radius_meters, status, started_at, ended_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.teacherId,
          session.classId,
          session.title,
          session.room,
          session.secret,
          session.rotateIntervalSec,
          session.preventDuplicateDevice ? 1 : 0,
          session.lateAfterMinutes,
          session.geoLock?.lat ?? null,
          session.geoLock?.lng ?? null,
          session.geoLock?.radiusMeters ?? null,
          session.status,
          session.startedAt,
          session.endedAt,
        ]
      );
    });

    return session;
  },

  async updateSession(id, updates) {
    const session = await this.getSessionById(id);
    if (!session) return null;

    let status = session.status;
    let endedAt = session.endedAt;
    if (updates.status !== undefined && ['active', 'paused', 'ended'].includes(updates.status)) {
      status = updates.status;
      if (status === 'ended' && !endedAt) {
        endedAt = new Date().toISOString();
      }
      if (status === 'active') {
        endedAt = null;
      }
    }

    const rotateIntervalSec =
      updates.rotateIntervalSec !== undefined
        ? Math.min(15, Math.max(3, Number(updates.rotateIntervalSec) || 8))
        : session.rotateIntervalSec;

    const preventDuplicateDevice =
      updates.preventDuplicateDevice !== undefined
        ? Boolean(updates.preventDuplicateDevice)
        : session.preventDuplicateDevice;

    let lateAfterMinutes = session.lateAfterMinutes;
    if (updates.lateAfterMinutes !== undefined) {
      const parsed = Number(updates.lateAfterMinutes);
      lateAfterMinutes =
        updates.lateAfterMinutes === null || updates.lateAfterMinutes === ''
          ? null
          : Number.isFinite(parsed) && parsed >= 1 && parsed <= 180
          ? Math.round(parsed)
          : session.lateAfterMinutes;
    }

    const title =
      updates.title !== undefined && updates.title.trim() ? updates.title.trim() : session.title;

    await getDb().execute(
      `UPDATE sessions
       SET status = ?, ended_at = ?, rotate_interval_sec = ?,
           prevent_duplicate_device = ?, late_after_minutes = ?, title = ?
       WHERE id = ?`,
      [
        status,
        endedAt,
        rotateIntervalSec,
        preventDuplicateDevice ? 1 : 0,
        lateAfterMinutes,
        title,
        id,
      ]
    );

    return {
      ...session,
      status,
      endedAt,
      rotateIntervalSec,
      preventDuplicateDevice,
      lateAfterMinutes,
      title,
    };
  },

  async deleteSession(id) {
    await getDb().execute(`DELETE FROM sessions WHERE id = ?`, [id]);
  },

  // ==========================================
  // ATTENDANCE RECORDS
  // ==========================================
  async getRecordsBySession(sessionId) {
    const rows = await getDb().query(
      `SELECT * FROM records WHERE session_id = ? ORDER BY checked_in_at DESC`,
      [sessionId]
    );
    return rows.map(mapRecord);
  },

  async findDeviceRecordInSession(sessionId, { deviceId = '', deviceCookieId = '' }) {
    const conditions = [];
    const params = [sessionId];

    if (deviceId) {
      conditions.push('device_id = ?');
      params.push(deviceId);
    }
    if (deviceCookieId) {
      conditions.push('device_cookie_id = ?');
      params.push(deviceCookieId);
    }
    if (conditions.length === 0) return null;

    const row = await getDb().queryOne(
      `SELECT * FROM records
       WHERE session_id = ? AND method <> 'manual' AND (${conditions.join(' OR ')})
       LIMIT 1`,
      params
    );
    return mapRecord(row);
  },

  async addRecord({
    sessionId,
    studentId,
    studentName,
    deviceId = '',
    deviceCookieId = '',
    clientIp = '',
    method = 'qr',
    note = '',
    status = null,
    nowMs = Date.now(),
  }) {
    const db = getDb();
    const trimmedId = studentId.trim();
    const normalizedId = trimmedId.toUpperCase();

    const existingStudent = await db.queryOne(
      `SELECT * FROM records WHERE session_id = ? AND student_id_normalized = ?`,
      [sessionId, normalizedId]
    );
    if (existingStudent) {
      return { error: 'ALREADY_CHECKED_IN', existing: mapRecord(existingStudent) };
    }

    const session = await this.getSessionById(sessionId);
    if (session?.preventDuplicateDevice && method !== 'manual') {
      const existingDevice = await this.findDeviceRecordInSession(sessionId, {
        deviceId,
        deviceCookieId,
      });
      if (existingDevice) {
        return { error: 'DEVICE_ALREADY_USED', existing: existingDevice };
      }
    }

    let computedStatus = status === 'late' || status === 'present' ? status : 'present';
    if (!status && session?.lateAfterMinutes && session.lateAfterMinutes > 0) {
      const startedMs = Date.parse(session.startedAt);
      if (Number.isFinite(startedMs) && nowMs - startedMs > session.lateAfterMinutes * 60 * 1000) {
        computedStatus = 'late';
      }
    }

    const record = {
      id: `rec_${crypto.randomBytes(6).toString('hex')}`,
      sessionId,
      studentId: trimmedId,
      studentName: studentName.trim(),
      status: computedStatus,
      deviceId: deviceId || '',
      deviceCookieId: deviceCookieId || '',
      clientIp: clientIp || '',
      method,
      note: (note || '').trim(),
      checkedInAt: new Date(nowMs).toISOString(),
    };

    try {
      await db.execute(
        `INSERT INTO records (
           id, session_id, student_id, student_id_normalized, student_name,
           status, device_id, device_cookie_id, client_ip, method, note, checked_in_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.sessionId,
          record.studentId,
          normalizedId,
          record.studentName,
          record.status,
          record.deviceId,
          record.deviceCookieId,
          record.clientIp,
          record.method,
          record.note,
          record.checkedInAt,
        ]
      );
    } catch (err) {
      // Handle race condition on UNIQUE(session_id, student_id_normalized)
      const dup = await db.queryOne(
        `SELECT * FROM records WHERE session_id = ? AND student_id_normalized = ?`,
        [sessionId, normalizedId]
      );
      if (dup) {
        return { error: 'ALREADY_CHECKED_IN', existing: mapRecord(dup) };
      }
      throw err;
    }

    return { record };
  },

  async updateRecord(recordId, sessionId, { status, note }) {
    const existing = await getDb().queryOne(
      `SELECT * FROM records WHERE id = ? AND session_id = ?`,
      [recordId, sessionId]
    );
    if (!existing) return null;

    const nextStatus =
      status === 'late' || status === 'present' ? status : existing.status || 'present';
    const nextNote = note !== undefined ? String(note || '').trim() : existing.note || '';

    await getDb().execute(
      `UPDATE records SET status = ?, note = ? WHERE id = ? AND session_id = ?`,
      [nextStatus, nextNote, recordId, sessionId]
    );

    return mapRecord({ ...existing, status: nextStatus, note: nextNote });
  },

  async removeRecord(recordId, sessionId) {
    const { changes } = await getDb().execute(
      `DELETE FROM records WHERE id = ? AND session_id = ?`,
      [recordId, sessionId]
    );
    return changes > 0;
  },

  // ==========================================
  // REPORTS & BULK EXPORT AGGREGATION
  // ==========================================
  async getAttendanceReport(teacherId, { classId = null, from = null, to = null } = {}) {
    const db = getDb();
    const where = ['s.teacher_id = ?'];
    const params = [teacherId];

    if (classId) {
      where.push('s.class_id = ?');
      params.push(classId);
    }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      where.push('s.started_at >= ?');
      params.push(`${from}T00:00:00.000Z`);
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      where.push('s.started_at <= ?');
      params.push(`${to}T23:59:59.999Z`);
    }

    const whereSql = where.join(' AND ');

    const sessionRows = await db.query(
      `SELECT s.id, s.class_id, s.title, s.room, s.status, s.started_at, s.ended_at, s.late_after_minutes,
              c.code AS class_code, c.name AS class_name, c.room AS class_room
       FROM sessions s
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE ${whereSql}
       ORDER BY s.started_at DESC`,
      params
    );

    const recordRows = await db.query(
      `SELECT r.id, r.session_id, r.student_id, r.student_id_normalized, r.student_name,
              r.status, r.method, r.note, r.checked_in_at,
              s.class_id, s.title AS session_title, s.room AS session_room, s.started_at AS session_started_at,
              c.code AS class_code, c.name AS class_name, c.room AS class_room
       FROM records r
       INNER JOIN sessions s ON s.id = r.session_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE ${whereSql}
       ORDER BY s.started_at DESC, r.checked_in_at ASC`,
      params
    );

    const courseMap = new Map();
    for (const s of sessionRows) {
      if (!courseMap.has(s.class_id)) {
        courseMap.set(s.class_id, {
          classId: s.class_id,
          code: s.class_code || '',
          name: s.class_name || 'Course',
          room: s.class_room || '',
          sessionCount: 0,
          totalCheckIns: 0,
          presentCount: 0,
          lateCount: 0,
          studentSet: new Set(),
        });
      }
      courseMap.get(s.class_id).sessionCount += 1;
    }

    const studentMap = new Map();
    let presentCount = 0;
    let lateCount = 0;

    for (const r of recordRows) {
      const isLate = r.status === 'late';
      if (isLate) lateCount += 1;
      else presentCount += 1;

      const courseStat = courseMap.get(r.class_id);
      if (courseStat) {
        courseStat.totalCheckIns += 1;
        if (isLate) courseStat.lateCount += 1;
        else courseStat.presentCount += 1;
        courseStat.studentSet.add(r.student_id_normalized);
      }

      const key = r.student_id_normalized;
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          studentId: r.student_id,
          studentName: r.student_name,
          coursesSet: new Set(),
          sessionsSet: new Set(),
          presentCount: 0,
          lateCount: 0,
          qrCount: 0,
          manualCount: 0,
          lastCheckedInAt: r.checked_in_at,
        });
      }
      const st = studentMap.get(key);
      st.sessionsSet.add(r.session_id);
      if (r.class_code) st.coursesSet.add(r.class_code);
      if (isLate) st.lateCount += 1;
      else st.presentCount += 1;
      if (r.method === 'qr') st.qrCount += 1;
      else st.manualCount += 1;
      if (r.checked_in_at > st.lastCheckedInAt) {
        st.lastCheckedInAt = r.checked_in_at;
        st.studentName = r.student_name;
      }
    }

    const totalSessions = sessionRows.length;
    const totalCheckIns = recordRows.length;
    const uniqueStudents = studentMap.size;
    const onTimeRate = totalCheckIns > 0 ? Math.round((presentCount / totalCheckIns) * 100) : 100;
    const avgPerSession = totalSessions > 0 ? Number((totalCheckIns / totalSessions).toFixed(1)) : 0;

    const courses = Array.from(courseMap.values())
      .map(({ studentSet, ...rest }) => ({
        ...rest,
        uniqueStudents: studentSet.size,
        avgPerSession:
          rest.sessionCount > 0 ? Number((rest.totalCheckIns / rest.sessionCount).toFixed(1)) : 0,
        onTimeRate:
          rest.totalCheckIns > 0 ? Math.round((rest.presentCount / rest.totalCheckIns) * 100) : 100,
      }))
      .sort((a, b) => b.totalCheckIns - a.totalCheckIns);

    const students = Array.from(studentMap.values())
      .map(({ coursesSet, sessionsSet, ...rest }) => {
        const sessionsAttended = sessionsSet.size;
        const attendanceRate =
          totalSessions > 0 ? Math.round((sessionsAttended / totalSessions) * 100) : 0;
        return {
          ...rest,
          courses: Array.from(coursesSet).sort(),
          sessionsAttended,
          totalSessions,
          attendanceRate,
        };
      })
      .sort((a, b) => b.sessionsAttended - a.sessionsAttended || a.studentName.localeCompare(b.studentName));

    const records = recordRows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      sessionTitle: r.session_title,
      sessionStartedAt: r.session_started_at,
      classCode: r.class_code || '',
      className: r.class_name || '',
      room: r.session_room || r.class_room || '',
      studentId: r.student_id,
      studentName: r.student_name,
      status: r.status === 'late' ? 'late' : 'present',
      method: r.method || 'qr',
      note: r.note || '',
      checkedInAt: r.checked_in_at,
    }));

    return {
      summary: {
        totalSessions,
        totalCheckIns,
        uniqueStudents,
        presentCount,
        lateCount,
        onTimeRate,
        avgPerSession,
      },
      courses,
      students,
      records,
    };
  },
};
