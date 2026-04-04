import bcrypt from 'bcryptjs';
import { randomUUID, randomHex, hmacSign, hmacVerify, generateLicenseKey } from './crypto';
import type { Env, User } from './types';

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'www', 'system', 'root', 'null', 'undefined', 'purroxy',
]);

// --- Password helpers ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain a number.';
  return null;
}

// --- Username validation ---

export function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 30) {
    return 'Username must be between 3 and 30 characters.';
  }
  if (!/^[a-z0-9-]+$/.test(username)) {
    return 'Username can only contain lowercase letters, numbers, and hyphens.';
  }
  if (username.startsWith('-') || username.endsWith('-')) {
    return 'Username cannot start or end with a hyphen.';
  }
  if (RESERVED_USERNAMES.has(username)) {
    return 'That username is reserved.';
  }
  return null;
}

// --- Session tokens ---

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}

export async function createSessionToken(
  userId: string,
  email: string,
  secret: string,
): Promise<string> {
  const exp = Date.now() + SESSION_EXPIRY_MS;
  const payload = JSON.stringify({ userId, email, exp });
  const encoded = toBase64Url(payload);
  const sig = await hmacSign(secret, encoded);
  return encoded + '.' + sig;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<{ userId: string; email: string } | null> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  const encoded = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  if (!encoded || !sig) return null;

  const valid = await hmacVerify(secret, encoded, sig);
  if (!valid) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encoded));
    if (!payload.userId || !payload.email || !payload.exp) return null;
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

// --- User CRUD ---

export async function createUser(
  db: D1Database,
  email: string,
  passwordHash: string,
  username: string,
): Promise<User> {
  const id = randomUUID();
  const licenseKey = generateLicenseKey();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, license_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, username, email, passwordHash, licenseKey, now, now)
    .run();

  return {
    id,
    username,
    email,
    password_hash: passwordHash,
    license_key: licenseKey,
    subscription_status: 'none',
    stripe_customer_id: null,
    subscription_stripe_id: null,
    github_username: null,
    contributor_status: 'none',
    email_verified: 0,
    verify_token: null,
    verify_token_expires: null,
    reset_token: null,
    reset_token_expires: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return (await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>()) ?? null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  return (await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>()) ?? null;
}

export async function getUserByLicenseKey(db: D1Database, key: string): Promise<User | null> {
  return (
    (await db.prepare('SELECT * FROM users WHERE license_key = ?').bind(key).first<User>()) ?? null
  );
}

export async function getUserByUsername(db: D1Database, username: string): Promise<User | null> {
  return (
    (await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<User>()) ??
    null
  );
}

// --- Email verification ---

export async function createVerifyToken(db: D1Database, userId: string): Promise<string> {
  const token = randomHex(32);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  await db
    .prepare('UPDATE users SET verify_token = ?, verify_token_expires = ?, updated_at = ? WHERE id = ?')
    .bind(token, expires, new Date().toISOString(), userId)
    .run();

  return token;
}

export async function verifyEmail(db: D1Database, token: string): Promise<boolean> {
  const user = await db
    .prepare('SELECT id, verify_token_expires FROM users WHERE verify_token = ?')
    .bind(token)
    .first<{ id: string; verify_token_expires: string }>();

  if (!user) return false;
  if (new Date(user.verify_token_expires) < new Date()) return false;

  await db
    .prepare(
      'UPDATE users SET email_verified = 1, verify_token = NULL, verify_token_expires = NULL, updated_at = ? WHERE id = ?',
    )
    .bind(new Date().toISOString(), user.id)
    .run();

  return true;
}

// --- Password reset ---

export async function createResetToken(db: D1Database, email: string): Promise<string | null> {
  const user = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();

  if (!user) return null;

  const token = randomHex(32);
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await db
    .prepare('UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ? WHERE id = ?')
    .bind(token, expires, new Date().toISOString(), user.id)
    .run();

  return token;
}

export async function resetPassword(
  db: D1Database,
  token: string,
  newHash: string,
): Promise<boolean> {
  const user = await db
    .prepare('SELECT id, reset_token_expires FROM users WHERE reset_token = ?')
    .bind(token)
    .first<{ id: string; reset_token_expires: string }>();

  if (!user) return false;
  if (new Date(user.reset_token_expires) < new Date()) return false;

  await db
    .prepare(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ? WHERE id = ?',
    )
    .bind(newHash, new Date().toISOString(), user.id)
    .run();

  return true;
}
