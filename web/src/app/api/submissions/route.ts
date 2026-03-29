import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';
import { createProfileSubmission } from '@/lib/profiles';
import { createSitePR, isGithubConfigured } from '@/lib/github';

initSchema();

// GET: check submission status for a profile
export async function GET(request: NextRequest) {
  const licenseKey = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!licenseKey) return NextResponse.json({ error: 'License key required.' }, { status: 401 });

  const user = getUserByLicenseKey(licenseKey);
  if (!user) return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });

  const profileId = request.nextUrl.searchParams.get('profileId');
  if (!profileId) return NextResponse.json({ error: 'profileId required.' }, { status: 400 });

  const db = getDb();
  const submission = db.prepare(`
    SELECT id, status, rejection_reason, created_at, reviewed_at
    FROM submissions
    WHERE profile_id = ? AND submitter_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(profileId, user.id) as any;

  if (!submission) return NextResponse.json({ submitted: false });

  return NextResponse.json({
    submitted: true,
    submissionId: submission.id,
    status: submission.status,
    rejectionReason: submission.rejection_reason,
    submittedAt: submission.created_at,
    reviewedAt: submission.reviewed_at,
  });
}

export async function POST(request: NextRequest) {
  const licenseKey = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!licenseKey) {
    return NextResponse.json({ error: 'License key required.' }, { status: 401 });
  }

  const user = getUserByLicenseKey(licenseKey);
  if (!user) {
    return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.profileJson || !body?.authSpecJson || !body?.endpointsJson) {
    return NextResponse.json({
      error: 'profileJson, authSpecJson, and endpointsJson are required.',
    }, { status: 400 });
  }

  const profileJson = typeof body.profileJson === 'string' ? body.profileJson : JSON.stringify(body.profileJson);
  const authSpecJson = typeof body.authSpecJson === 'string' ? body.authSpecJson : JSON.stringify(body.authSpecJson);
  const endpointsJson = typeof body.endpointsJson === 'string' ? body.endpointsJson : JSON.stringify(body.endpointsJson);

  const result = createProfileSubmission(user.id, profileJson, authSpecJson, endpointsJson);

  if (!result.validationResult.valid) {
    return NextResponse.json({
      error: 'Profile validation failed.',
      profileId: result.profileId,
      submissionId: result.submissionId,
      validation: result.validationResult,
    }, { status: 422 });
  }

  // Auto-create a GitHub PR for the site submission
  let prUrl: string | null = null;
  if (isGithubConfigured()) {
    const profile = JSON.parse(profileJson);
    const db = getDb();
    const userRow = db.prepare('SELECT github_username FROM users WHERE id = ?').get(user.id) as any;

    const prResult = await createSitePR({
      siteName: profile.name || profile.siteName || 'site',
      displayName: profile.name || profile.siteName,
      description: profile.description || `Site: ${profile.siteName}`,
      siteUrl: profile.siteBaseUrl || '',
      capabilities: (body.capabilities as string[]) || [],
      submitterEmail: user.email,
      submitterGithub: userRow?.github_username || undefined,
      submissionId: result.submissionId,
      profileJson,
    });

    if (prResult) {
      prUrl = prResult.prUrl;
      // Store the PR number on the submission for later merge/close
      db.prepare(`
        UPDATE submissions SET github_pr_number = ? WHERE id = ?
      `).run(prResult.prNumber, result.submissionId);
    }
  }

  return NextResponse.json({
    profileId: result.profileId,
    submissionId: result.submissionId,
    status: 'pending',
    validation: result.validationResult,
    githubPr: prUrl,
  }, { status: 201 });
}
