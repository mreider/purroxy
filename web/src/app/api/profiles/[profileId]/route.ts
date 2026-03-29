import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getProfile } from '@/lib/profiles';

initSchema();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const profile = getProfile(profileId);

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}
