import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';
import { getUserByLicenseKey, getUserByEmail, getUserByDisplayName, hashPassword, verifyPassword, validatePassword, createVerifyToken } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

initSchema();

// GET: fetch profile by license key
export async function GET(request: NextRequest) {
  const licenseKey = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!licenseKey) return NextResponse.json({ error: 'License key required.' }, { status: 401 });

  const user = getUserByLicenseKey(licenseKey);
  if (!user) return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });

  return NextResponse.json({
    email: user.email,
    displayName: user.display_name,
    subscriptionStatus: user.subscription_status,
    contributorStatus: user.contributor_status,
    createdAt: user.created_at,
  });
}

// PUT: update profile
export async function PUT(request: NextRequest) {
  const licenseKey = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!licenseKey) return NextResponse.json({ error: 'License key required.' }, { status: 401 });

  const user = getUserByLicenseKey(licenseKey) as any;
  if (!user) return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request body required.' }, { status: 400 });

  const db = getDb();

  // Update display name
  if (body.displayName !== undefined) {
    const name = body.displayName?.trim() || null;
    if (name) {
      const existing = getUserByDisplayName(name);
      if (existing && existing.id !== user.id) {
        return NextResponse.json({ error: 'That display name is already taken.' }, { status: 409 });
      }
    }
    db.prepare('UPDATE users SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, user.id);
  }

  // Update email (requires re-verification)
  if (body.newEmail) {
    const email = body.newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }
    const existing = getUserByEmail(email);
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    db.prepare('UPDATE users SET email = ?, email_verified = 0, updated_at = datetime(\'now\') WHERE id = ?').run(email, user.id);
    const token = createVerifyToken(user.id);
    sendVerificationEmail(email, token, user.display_name || undefined).catch(() => {});
    return NextResponse.json({ success: true, emailChanged: true, message: 'Email updated. Check your new email to verify.' });
  }

  // Update password
  if (body.newPassword) {
    if (!body.currentPassword) {
      return NextResponse.json({ error: 'Current password required.' }, { status: 400 });
    }
    const valid = await verifyPassword(body.currentPassword, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 403 });
    }
    const passwordError = validatePassword(body.newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
    const newHash = await hashPassword(body.newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newHash, user.id);
  }

  return NextResponse.json({ success: true });
}
