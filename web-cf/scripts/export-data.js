#!/usr/bin/env node
// Export data from the old SQLite database to D1-compatible SQL.
// Usage: node scripts/export-data.js [path-to-purroxy.db] > exported-data.sql
//
// Then import with: wrangler d1 execute purroxy-db --remote --file=exported-data.sql

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '../../web/data/purroxy.db');

let db;
try {
  db = new Database(dbPath, { readonly: true });
} catch (err) {
  console.error(`Cannot open database at ${dbPath}: ${err.message}`);
  process.exit(1);
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function usernameFromUser(row) {
  // Generate a username from display_name or email
  if (row.display_name) {
    return row.display_name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'user-' + row.id.slice(0, 8);
  }
  const prefix = (row.email || '').split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 22);
  return (prefix || 'user') + '-' + row.id.slice(0, 6);
}

// Export users
const users = db.prepare('SELECT * FROM users').all();
const usedUsernames = new Set();

console.log('-- Users');
for (const u of users) {
  let username = usernameFromUser(u);
  // Ensure uniqueness
  let base = username;
  let counter = 1;
  while (usedUsernames.has(username)) {
    username = `${base}-${counter}`;
    counter++;
  }
  usedUsernames.add(username);

  console.log(`INSERT INTO users (id, username, email, password_hash, license_key, subscription_status, stripe_customer_id, subscription_stripe_id, github_username, contributor_status, email_verified, verify_token, verify_token_expires, reset_token, reset_token_expires, created_at, updated_at) VALUES (${esc(u.id)}, ${esc(username)}, ${esc(u.email)}, ${esc(u.password_hash)}, ${esc(u.license_key)}, ${esc(u.subscription_status || 'none')}, ${esc(u.stripe_customer_id)}, ${esc(u.subscription_stripe_id)}, ${esc(u.github_username)}, ${esc(u.contributor_status || 'none')}, ${u.email_verified || 0}, ${esc(u.verify_token)}, ${esc(u.verify_token_expires)}, ${esc(u.reset_token)}, ${esc(u.reset_token_expires)}, ${esc(u.created_at)}, ${esc(u.updated_at)});`);
}

// Export submissions
try {
  const submissions = db.prepare('SELECT * FROM submissions').all();
  if (submissions.length > 0) {
    console.log('\n-- Submissions');
    for (const s of submissions) {
      // Find the submitter's username
      const submitter = db.prepare('SELECT display_name, email, id FROM users WHERE id = ?').get(s.submitter_id);
      const username = submitter ? usernameFromUser(submitter) : 'unknown';
      console.log(`INSERT INTO submissions (id, username, site_slug, submission_type, github_pr_number, github_pr_url, status, rejection_reason, created_at, reviewed_at) VALUES (${esc(s.id)}, ${esc(username)}, ${esc(s.site_slug)}, ${esc(s.submission_type || 'new_site')}, ${s.github_pr_number || 'NULL'}, ${esc(s.github_pr_url)}, ${esc(s.status)}, ${esc(s.rejection_reason)}, ${esc(s.created_at)}, ${esc(s.reviewed_at)});`);
    }
  }
} catch { /* table may not exist */ }

// Export user_profiles (usage data)
try {
  const userProfiles = db.prepare('SELECT * FROM user_profiles').all();
  if (userProfiles.length > 0) {
    console.log('\n-- User profiles (usage)');
    for (const up of userProfiles) {
      console.log(`INSERT INTO user_profiles (id, user_id, profile_id, installed_version, execution_count, last_executed_at, acquired_at) VALUES (${esc(up.id)}, ${esc(up.user_id)}, ${esc(up.profile_id)}, ${up.installed_version || 1}, ${up.execution_count || 0}, ${esc(up.last_executed_at)}, ${esc(up.acquired_at)});`);
    }
  }
} catch { /* table may not exist */ }

console.log('\n-- Migration complete');
db.close();
