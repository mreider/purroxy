-- Purroxy D1 Schema
-- Users, submissions, usage tracking, reviews, bug reports
-- Sites/profiles live in the purroxy-sites GitHub repo, not here.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  license_key TEXT UNIQUE NOT NULL,
  subscription_status TEXT DEFAULT 'none',
  stripe_customer_id TEXT,
  subscription_stripe_id TEXT,
  github_username TEXT,
  contributor_status TEXT DEFAULT 'none',
  email_verified INTEGER DEFAULT 0,
  verify_token TEXT,
  verify_token_expires TEXT,
  reset_token TEXT,
  reset_token_expires TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  site_slug TEXT,
  submission_type TEXT DEFAULT 'new_site',
  github_pr_number INTEGER,
  github_pr_url TEXT,
  status TEXT DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  profile_id TEXT NOT NULL,
  installed_version INTEGER NOT NULL DEFAULT 1,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TEXT,
  acquired_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, profile_id)
);

CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY,
  site_slug TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  endpoint_name TEXT,
  error_status INTEGER,
  error_message TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  site_slug TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(site_slug, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_license ON users(license_key);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_submissions_pr ON submissions(github_pr_number);
CREATE INDEX IF NOT EXISTS idx_submissions_username ON submissions(username);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_profile ON user_profiles(profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_slug ON reviews(site_slug);
