import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { hashPassword, resetPassword, validatePassword } from '@/lib/auth';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.token || !body?.password) {
    return NextResponse.json({ error: 'Token and new password are required.' }, { status: 400 });
  }

  const passwordError = validatePassword(body.password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  const result = resetPassword(body.token, passwordHash);

  if (!result.success) {
    return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 });
  }

  return NextResponse.json({ message: 'Password updated. You can log in now.' });
}
