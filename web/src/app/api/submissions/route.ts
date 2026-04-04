import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';
import { createProfileSubmission } from '@/lib/profiles';
import { createSitePR, isGithubConfigured, getPRState, getPRCloseComment } from '@/lib/github';
import { processApproval, processRejection } from '@/app/api/github/webhook/route';

initSchema();

// GET: check submission status for a profile (with polling fallback)
export async function GET(request: NextRequest) {
  const licenseKey = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!licenseKey) return NextResponse.json({ error: 'License key required.' }, { status: 401 });

  const user = getUserByLicenseKey(licenseKey);
  if (!user) return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });

  const profileId = request.nextUrl.searchParams.get('profileId');
  if (!profileId) return NextResponse.json({ error: 'profileId required.' }, { status: 400 });

  const db = getDb();
  const submission = db.prepare(`
    SELECT id, status, rejection_reason, created_at, reviewed_at, github_pr_url, github_pr_number, site_slug, submission_type
    FROM submissions
    WHERE profile_id = ? AND submitter_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(profileId, user.id) as any;

  if (!submission) return NextResponse.json({ submitted: false });

  // Polling fallback: if still pending and we have a PR number, check GitHub
  if (submission.status === 'pending' && submission.github_pr_number) {
    const prState = await getPRState(submission.github_pr_number);
    if (prState && prState.state === 'closed') {
      if (prState.merged) {
        await processApproval(submission);
        submission.status = 'approved';
        submission.reviewed_at = prState.mergedAt;
      } else {
        const reason = await getPRCloseComment(submission.github_pr_number);
        await processRejection(submission, reason);
        submission.status = 'rejected';
        submission.rejection_reason = reason;
        submission.reviewed_at = prState.closedAt;
      }
    }
  }

  return NextResponse.json({
    submitted: true,
    submissionId: submission.id,
    status: submission.status,
    rejectionReason: submission.rejection_reason,
    submittedAt: submission.created_at,
    reviewedAt: submission.reviewed_at,
    githubPrUrl: submission.github_pr_url,
    submissionType: submission.submission_type,
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

  // Detect submission type: check if a site with this URL already exists
  const db = getDb();
  const profile = JSON.parse(profileJson);
  const siteBaseUrl = profile.siteBaseUrl || '';
  const existingSite = siteBaseUrl
    ? db.prepare('SELECT slug FROM sites WHERE site_url = ?').get(siteBaseUrl) as any
    : null;

  const submissionType = existingSite ? 'add_capability' : 'new_site';
  const siteSlug = existingSite?.slug || null;

  // Auto-create a GitHub PR for the site submission
  let prUrl: string | null = null;
  let prSlug: string | null = siteSlug;
  if (isGithubConfigured()) {
    const userRow = db.prepare('SELECT github_username FROM users WHERE id = ?').get(user.id) as any;

    const prResult = await createSitePR({
      siteName: profile.name || profile.siteName || 'site',
      displayName: profile.name || profile.siteName,
      description: profile.description || `Site: ${profile.siteName}`,
      siteUrl: siteBaseUrl,
      capabilities: (body.capabilities as string[]) || [],
      submitterEmail: user.email,
      submitterGithub: userRow?.github_username || undefined,
      submissionId: result.submissionId,
      profileJson,
      existingSiteSlug: existingSite?.slug || undefined,
    });

    if (prResult) {
      prUrl = prResult.prUrl;
      prSlug = prResult.slug;
      db.prepare(`
        UPDATE submissions SET github_pr_number = ?, github_pr_url = ?, site_slug = ?, submission_type = ? WHERE id = ?
      `).run(prResult.prNumber, prResult.prUrl, prResult.slug, submissionType, result.submissionId);
    }
  }

  return NextResponse.json({
    profileId: result.profileId,
    submissionId: result.submissionId,
    status: 'pending',
    validation: result.validationResult,
    githubPr: prUrl,
    githubPrUrl: prUrl,
    submissionType,
    siteSlug: prSlug,
  }, { status: 201 });
}
