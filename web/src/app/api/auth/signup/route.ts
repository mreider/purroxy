import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { hashPassword, createUser, getUserByEmail, getUserByDisplayName, createSessionToken, createVerifyToken, validatePassword } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }

  // Validate password strength
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  // Check for existing email
  const existing = getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  // Check for duplicate display name
  const displayName = body.displayName?.trim();
  if (displayName) {
    const nameTaken = getUserByDisplayName(displayName);
    if (nameTaken) {
      return NextResponse.json({ error: 'That display name is already taken.' }, { status: 409 });
    }
  }

  // Create account
  const passwordHash = await hashPassword(password);
  const user = createUser(email, passwordHash, body.displayName);
  const sessionToken = createSessionToken(user.id, user.email);

  // Create email verification token and send
  const verifyToken = createVerifyToken(user.id);
  sendVerificationEmail(user.email, verifyToken, body.displayName).catch(() => {});

  // Don't return license key or set session until email is verified
  return NextResponse.json({
    needsVerification: true,
    email: user.email,
    message: 'Account created. Check your email to verify before logging in.',
  }, { status: 201 });
}
