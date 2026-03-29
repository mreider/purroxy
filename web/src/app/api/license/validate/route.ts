import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const licenseKey = body?.licenseKey || request.headers.get('authorization')?.replace('Bearer ', '');

  if (!licenseKey) {
    return NextResponse.json({ valid: false, error: 'License key required.' }, { status: 400 });
  }

  const user = getUserByLicenseKey(licenseKey);
  if (!user) {
    return NextResponse.json({ valid: false, error: 'Invalid license key.' }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    userId: user.id,
    email: user.email,
    subscriptionStatus: user.subscription_status,
    contributorStatus: user.contributor_status,
    createdAt: user.created_at,
  });
}
