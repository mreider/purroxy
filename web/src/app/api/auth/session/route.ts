import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { verifySessionToken, getUserById } from '@/lib/auth';

initSchema();

export async function GET(request: NextRequest) {
  const token = request.cookies.get('purroxy-session')?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      licenseKey: user.license_key,
      subscriptionStatus: user.subscription_status,
    },
  });
}
