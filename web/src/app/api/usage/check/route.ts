import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';
import { checkUsage } from '@/lib/usage';

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

  const result = checkUsage(user.id, profileId, user.subscription_status);
  return NextResponse.json(result);
}
