import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, generateId, generateLicenseKey } from './db';

const SESSION_SECRET = process.env.PURROXY_SESSION_SECRET || 'dev-secret-change-in-production';
const SESSION_EXPIRY_HOURS = 24 * 30; // 30 days

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  license_key: string;
  subscription_status: string;
  contributor_status: string;
  created_at: string;
}

export interface Session {
  userId: string;
  email: string;
  expiresAt: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createSessionToken(userId: string, email: string): string {
  const expiresAt = Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload = JSON.stringify({ userId, email, expiresAt });
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  const token = Buffer.from(payload).toString('base64url') + '.' + hmac;
  return token;
}

export function verifySessionToken(token: string): Session | null {
  const [payloadB64, hmac] = token.split('.');
  if (!payloadB64 || !hmac) return null;

  const payload = Buffer.from(payloadB64, 'base64url').toString();
  const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

  const hmacBuf = Buffer.from(hmac);
  const expectedBuf = Buffer.from(expectedHmac);
  if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
    return null;
  }

  const session: Session = JSON.parse(payload);
  if (session.expiresAt < Date.now()) return null;

  return session;
}

export function getUserByDisplayName(displayName: string): User | null {
  const db = getDb();
  return (db.prepare(`SELECT id, email, display_name, license_key, subscription_status, contributor_status, created_at FROM users WHERE display_name = ?`).get(displayName) as any) || null;
}

export function createUser(email: string, passwordHash: string, displayName?: string): User {
  const db = getDb();
  const id = generateId();
  const licenseKey = generateLicenseKey();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, license_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, passwordHash, displayName || null, licenseKey);

  return {
    id,
    email,
    display_name: displayName || null,
    license_key: licenseKey,
    subscription_status: 'none',
    contributor_status: 'none',
    created_at: new Date().toISOString(),
  };
}

export function getUserByEmail(email: string): (User & { password_hash: string }) | null {
  const db = getDb();
  return (db.prepare(`SELECT id, email, password_hash, display_name, license_key, subscription_status, created_at FROM users WHERE email = ?`).get(email) as any) || null;
}

export function getUserByLicenseKey(licenseKey: string): User | null {
  const db = getDb();
  return (db.prepare(`SELECT id, email, display_name, license_key, subscription_status, contributor_status, created_at FROM users WHERE license_key = ?`).get(licenseKey) as any) || null;
}

export function getUserById(id: string): User | null {
  const db = getDb();
  return (db.prepare(`SELECT id, email, display_name, license_key, subscription_status, contributor_status, created_at FROM users WHERE id = ?`).get(id) as any) || null;
}

// Email verification
export function createVerifyToken(userId: string): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  db.prepare('UPDATE users SET verify_token = ?, verify_token_expires = ? WHERE id = ?').run(token, expires, userId);
  return token;
}

export function verifyEmail(token: string): { success: boolean; email?: string } {
  const db = getDb();
  const user = db.prepare('SELECT id, email, verify_token_expires FROM users WHERE verify_token = ?').get(token) as any;
  if (!user) return { success: false };
  if (new Date(user.verify_token_expires) < new Date()) return { success: false };

  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?').run(user.id);
  return { success: true, email: user.email };
}

export function isEmailVerified(userId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(userId) as any;
  return row?.email_verified === 1;
}

// Password reset
export function createResetToken(email: string): string | null {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
  if (!user) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, user.id);
  return token;
}

export function resetPassword(token: string, newPasswordHash: string): { success: boolean; email?: string } {
  const db = getDb();
  const user = db.prepare('SELECT id, email, reset_token_expires FROM users WHERE reset_token = ?').get(token) as any;
  if (!user) return { success: false };
  if (new Date(user.reset_token_expires) < new Date()) return { success: false };

  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(newPasswordHash, user.id);
  return { success: true, email: user.email };
}

// Password validation
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain a number.';
  return null;
}
