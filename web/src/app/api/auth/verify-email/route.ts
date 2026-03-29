import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { verifyEmail } from '@/lib/auth';

initSchema();

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://purroxy.com';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Token required.' }, { status: 400 });
  }

  const result = verifyEmail(token);
  if (!result.success) {
    // Token already used or expired, redirect to verify page with a message
    return NextResponse.redirect(`${APP_URL}/verify-email?expired=true`);
  }

  return NextResponse.redirect(`${APP_URL}/verify-email?success=true`);
}
