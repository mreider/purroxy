import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { verifyPassword, getUserByEmail, createSessionToken, isEmailVerified, createVerifyToken } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const user = getUserByEmail(email);

  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  // Block unverified users — offer to resend
  if (!isEmailVerified(user.id)) {
    // If ?resend=true, send a fresh verification email
    if (body.resend) {
      const token = createVerifyToken(user.id);
      sendVerificationEmail(user.email, token, user.display_name || undefined).catch(() => {});
      return NextResponse.json({
        needsVerification: true,
        email: user.email,
        resentEmail: true,
        message: 'Verification email sent. Check your inbox.',
      }, { status: 403 });
    }

    return NextResponse.json({
      needsVerification: true,
      email: user.email,
      message: 'Please verify your email before logging in.',
    }, { status: 403 });
  }

  const token = createSessionToken(user.id, user.email);

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      licenseKey: user.license_key,
      subscriptionStatus: user.subscription_status,
    },
  });

  response.cookies.set('purroxy-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}
