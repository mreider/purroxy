import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb, generateId } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';
import { sendBugReportNotification } from '@/lib/email';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const licenseKey = body?.licenseKey || request.headers.get('authorization')?.replace('Bearer ', '');

  if (!licenseKey) {
    return NextResponse.json({ error: 'License key required.' }, { status: 401 });
  }

  const user = getUserByLicenseKey(licenseKey);
  if (!user) {
    return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });
  }

  if (!body?.profileId) {
    return NextResponse.json({ error: 'profileId is required.' }, { status: 400 });
  }

  const db = getDb();
  const id = generateId();

  db.prepare(`
    INSERT INTO bug_reports (id, profile_id, reporter_id, profile_version, endpoint_name, error_status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.profileId,
    user.id,
    body.profileVersion || 1,
    body.endpointName || null,
    body.errorStatus || null,
    body.errorMessage || null
  );

  // Notify the profile creator (non-blocking)
  const profile = db.prepare('SELECT p.name, u.email FROM profiles p JOIN users u ON p.creator_id = u.id WHERE p.id = ?').get(body.profileId) as any;
  if (profile?.email) {
    sendBugReportNotification(profile.email, profile.name, body.endpointName, body.errorMessage).catch(() => {});
  }

  return NextResponse.json({ reportId: id }, { status: 201 });
}
