import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { createResetToken } from '@/lib/auth';
import { sendPasswordReset } from '@/lib/email';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const token = createResetToken(email);

  // Always return success (don't reveal if email exists)
  if (token) {
    sendPasswordReset(email, token).catch(() => {});
  }

  return NextResponse.json({
    message: 'If an account exists with that email, a reset link has been sent.',
  });
}
