import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

let dbInstance: Database.Database | null = null;
let currentDbPath: string = '';

export function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return `${actualSalt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(keyHex, 'hex');
  if (derivedBuffer.length !== storedBuffer.length) return false;
  return crypto.timingSafeEqual(derivedBuffer, storedBuffer);
}

export function initDatabase(customDbPath?: string): Database.Database {
  const resolvedPath =
    customDbPath ||
    process.env.DATABASE_PATH ||
    path.resolve(process.cwd(), 'civicpulse.db');

  if (dbInstance && currentDbPath === resolvedPath) {
    return dbInstance;
  }

  if (dbInstance && currentDbPath !== resolvedPath) {
    try {
      dbInstance.close();
    } catch {
      // Ignore close error on switch
    }
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      citizen_category TEXT,
      category TEXT NOT NULL,
      predicted_category TEXT NOT NULL,
      category_confidence REAL NOT NULL DEFAULT 0.75,
      category_method TEXT NOT NULL DEFAULT 'deterministic-rule-fallback',
      needs_review INTEGER NOT NULL DEFAULT 0,
      location_name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      summary TEXT NOT NULL,
      summary_method TEXT NOT NULL DEFAULT 'extractive-template-fallback',
      priority_score REAL NOT NULL,
      priority_level TEXT NOT NULL,
      priority_reason TEXT NOT NULL,
      priority_breakdown_json TEXT NOT NULL,
      urgency_score REAL NOT NULL DEFAULT 2.0,
      safety_score REAL NOT NULL DEFAULT 2.0,
      affected_score REAL NOT NULL DEFAULT 2.0,
      recurrence_score REAL NOT NULL DEFAULT 0.5,
      safety_override INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Submitted',
      assigned_team TEXT,
      duplicate_of_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL,
      duplicate_status TEXT NOT NULL DEFAULT 'unverified',
      duplicate_confidence REAL,
      duplicate_reason TEXT,
      duplicate_candidates_json TEXT NOT NULL DEFAULT '[]',
      recommended_action TEXT NOT NULL DEFAULT '',
      is_synthetic INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      image_filename TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_public_id ON complaints(public_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
    CREATE INDEX IF NOT EXISTS idx_complaints_priority_score ON complaints(priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at DESC);

    CREATE TABLE IF NOT EXISTS complaint_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      public_message TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_complaint_id ON complaint_status_history(complaint_id);

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'municipal_officer',
      created_at TEXT NOT NULL
    );
  `);

  // Idempotent admin user initialization from environment variables
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'civicpulse-admin-2026';

  const existingAdmin = db
    .prepare('SELECT id FROM admin_users WHERE username = ?')
    .get(adminUsername);

  if (!existingAdmin) {
    db.prepare(
      'INSERT INTO admin_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)'
    ).run(
      adminUsername,
      hashPassword(adminPassword),
      'municipal_officer',
      new Date().toISOString()
    );
  }

  dbInstance = db;
  currentDbPath = resolvedPath;
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}
