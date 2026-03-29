import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';
import { checkUsage, incrementUsage } from '@/lib/usage';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const licenseKey = body?.licenseKey || request.headers.get('authorization')?.replace('Bearer ', '');
  const profileId = body?.profileId;

  if (!licenseKey || !profileId) {
    return NextResponse.json({ error: 'licenseKey and profileId are required.' }, { status: 400 });
  }

  const user = getUserByLicenseKey(licenseKey);
  if (!user) {
    return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });
  }

  // Check before incrementing
  const check = checkUsage(user.id, profileId, user.subscription_status);
  if (!check.allowed) {
    return NextResponse.json({
      error: 'Usage limit reached. Subscribe to continue.',
      ...check,
    }, { status: 403 });
  }

  const newCount = incrementUsage(user.id, profileId);
  return NextResponse.json({ executionCount: newCount });
}
