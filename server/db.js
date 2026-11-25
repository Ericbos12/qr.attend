import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_SQLITE_PATH = path.join(DEFAULT_DATA_DIR, 'attendqr.db');

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'admin',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_verifications (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS support_reports (
    id TEXT PRIMARY KEY,
    teacher_id TEXT,
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT '',
    secret TEXT NOT NULL,
    rotate_interval_sec INTEGER NOT NULL DEFAULT 8,
    prevent_duplicate_device INTEGER NOT NULL DEFAULT 1,
    late_after_minutes INTEGER,
    geo_lat DOUBLE PRECISION,
    geo_lng DOUBLE PRECISION,
    geo_radius_meters INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    ended_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    student_id_normalized TEXT NOT NULL,
    student_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',
    device_id TEXT NOT NULL DEFAULT '',
    device_cookie_id TEXT NOT NULL DEFAULT '',
    client_ip TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT 'qr',
    note TEXT NOT NULL DEFAULT '',
    checked_in_at TEXT NOT NULL,
    UNIQUE(session_id, student_id_normalized)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_teacher_started ON sessions(teacher_id, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_id)`,
  `CREATE INDEX IF NOT EXISTS idx_records_session_time ON records(session_id, checked_in_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_records_session_device ON records(session_id, device_cookie_id)`,
  `CREATE INDEX IF NOT EXISTS idx_password_resets_teacher ON password_resets(teacher_id)`,
];

function convertPlaceholdersToPg(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeRow(row) {
  return row ? { ...row } : null;
}

class SqliteAdapter {
  constructor(dbPath) {
    this.dialect = 'sqlite';
    this.dbPath = dbPath;
    this.conn = null;
  }

  async init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const { DatabaseSync } = await import('node:sqlite');
    this.conn = new DatabaseSync(this.dbPath);
    this.conn.exec('PRAGMA journal_mode = WAL');
    this.conn.exec('PRAGMA foreign_keys = ON');
    this.conn.exec('PRAGMA busy_timeout = 5000');

    for (const stmt of SCHEMA_STATEMENTS) {
      this.conn.exec(stmt);
    }
  }

  async query(sql, params = []) {
    const stmt = this.conn.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map((r) => ({ ...r }));
  }

  async queryOne(sql, params = []) {
    const stmt = this.conn.prepare(sql);
    return normalizeRow(stmt.get(...params));
  }

  async execute(sql, params = []) {
    const stmt = this.conn.prepare(sql);
    const result = stmt.run(...params);
    return { changes: Number(result.changes || 0) };
  }

  async transaction(fn) {
    this.conn.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.conn.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.conn.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  async close() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
  }
}

class PostgresAdapter {
  constructor(connectionString) {
    this.dialect = 'postgres';
    this.connectionString = connectionString;
    this.pool = null;
  }

  async init() {
    const pgMod = await import('pg');
    const Pool = pgMod.default?.Pool || pgMod.Pool;
    const isLocalhost = /localhost|127\.0\.0\.1/i.test(this.connectionString);
    const disableSsl = process.env.DATABASE_SSL === 'false' || isLocalhost;
    const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';

    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: disableSsl ? false : { rejectUnauthorized },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    for (const stmt of SCHEMA_STATEMENTS) {
      await this.pool.query(stmt);
    }
  }

  async query(sql, params = []) {
    const res = await this.pool.query(convertPlaceholdersToPg(sql), params);
    return res.rows;
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  async execute(sql, params = []) {
    const res = await this.pool.query(convertPlaceholdersToPg(sql), params);
    return { changes: Number(res.rowCount || 0) };
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    const tx = {
      dialect: 'postgres',
      query: async (sql, params = []) => {
        const res = await client.query(convertPlaceholdersToPg(sql), params);
        return res.rows;
      },
      queryOne: async (sql, params = []) => {
        const res = await client.query(convertPlaceholdersToPg(sql), params);
        return res.rows[0] || null;
      },
      execute: async (sql, params = []) => {
        const res = await client.query(convertPlaceholdersToPg(sql), params);
        return { changes: Number(res.rowCount || 0) };
      },
    };
    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

let dbInstance = null;

export async function initDatabase() {
  if (dbInstance) return dbInstance;
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (databaseUrl) {
    dbInstance = new PostgresAdapter(databaseUrl);
  } else {
    const sqlitePath = (process.env.SQLITE_PATH || '').trim() || DEFAULT_SQLITE_PATH;
    dbInstance = new SqliteAdapter(sqlitePath);
  }
  await dbInstance.init();
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database has not been initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export function getLegacyJsonPath() {
  return path.join(DEFAULT_DATA_DIR, 'attendance.json');
}
