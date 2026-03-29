import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';
import { getProfile, loadProfilePackage, incrementDownloadCount } from '@/lib/profiles';

initSchema();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const licenseKey = request.headers.get('authorization')?.replace('Bearer ', '');

  if (!licenseKey) {
    return NextResponse.json({ error: 'License key required.' }, { status: 401 });
  }

  const user = getUserByLicenseKey(licenseKey);
  if (!user) {
    return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });
  }

  const profile = getProfile(profileId);
  if (!profile || profile.status !== 'approved') {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const pkg = loadProfilePackage(profileId, profile.current_version);
  if (!pkg) {
    return NextResponse.json({ error: 'Profile package not available.' }, { status: 404 });
  }

  incrementDownloadCount(profileId);

  return NextResponse.json({
    profileId,
    version: profile.current_version,
    files: {
      'profile.json': JSON.parse(pkg.profileJson),
      'auth-spec.json': JSON.parse(pkg.authSpecJson),
      'endpoints.json': JSON.parse(pkg.endpointsJson),
    },
  });
}
