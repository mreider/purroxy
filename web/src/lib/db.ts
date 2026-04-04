import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.PURROXY_DB_PATH || path.join(process.cwd(), 'data', 'purroxy.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function initSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      license_key TEXT UNIQUE NOT NULL,
      subscription_status TEXT DEFAULT 'none',
      stripe_customer_id TEXT,
      stripe_connect_account_id TEXT,
      github_username TEXT,
      contributor_status TEXT DEFAULT 'none',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      site_name TEXT NOT NULL,
      site_base_url TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      auth_type TEXT NOT NULL,
      endpoint_count INTEGER NOT NULL DEFAULT 0,
      current_version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      download_count INTEGER DEFAULT 0,
      average_rating REAL,
      package_path TEXT,
      checksum TEXT NOT NULL,
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile_versions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      version INTEGER NOT NULL,
      package_path TEXT NOT NULL,
      checksum TEXT NOT NULL,
      changelog TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(profile_id, version)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      profile_id TEXT NOT NULL,
      installed_version INTEGER NOT NULL,
      execution_count INTEGER DEFAULT 0,
      last_executed_at TEXT,
      acquired_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      version INTEGER NOT NULL,
      submitter_id TEXT NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      rejection_reason TEXT,
      validation_result TEXT,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      site_url TEXT NOT NULL,
      capabilities TEXT,
      author TEXT,
      profile_id TEXT,
      download_count INTEGER DEFAULT 0,
      average_rating REAL,
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bug_reports (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      reporter_id TEXT NOT NULL REFERENCES users(id),
      profile_version INTEGER NOT NULL,
      endpoint_name TEXT,
      error_status INTEGER,
      error_message TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      review_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(profile_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

    -- Migration: add email verification and password reset columns
    -- SQLite ignores ADD COLUMN if column already exists (throws, we catch)
  `);

  // Safe column additions
  const migrations = [
    "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN verify_token TEXT",
    "ALTER TABLE users ADD COLUMN verify_token_expires TEXT",
    "ALTER TABLE users ADD COLUMN reset_token TEXT",
    "ALTER TABLE users ADD COLUMN reset_token_expires TEXT",
    "ALTER TABLE users ADD COLUMN github_username TEXT",
    "ALTER TABLE users ADD COLUMN contributor_status TEXT DEFAULT 'none'",
    "ALTER TABLE submissions ADD COLUMN github_pr_number INTEGER",
    "ALTER TABLE submissions ADD COLUMN github_pr_url TEXT",
    "ALTER TABLE submissions ADD COLUMN site_slug TEXT",
    "ALTER TABLE submissions ADD COLUMN submission_type TEXT DEFAULT 'new_site'",
    "ALTER TABLE users ADD COLUMN subscription_stripe_id TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sites_slug ON sites(slug);
    CREATE INDEX IF NOT EXISTS idx_submissions_github_pr ON submissions(github_pr_number);
    CREATE INDEX IF NOT EXISTS idx_submissions_site ON submissions(site_slug);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name) WHERE display_name IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_profiles_creator ON profiles(creator_id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_profile ON user_profiles(profile_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
  `);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateLicenseKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
