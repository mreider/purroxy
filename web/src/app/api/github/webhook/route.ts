import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb, initSchema } from '@/lib/db';
import { grantContributorAccess } from '@/lib/stripe';

initSchema();

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

function verifySignature(payload: string, signature: string): boolean {
  if (!GITHUB_WEBHOOK_SECRET) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';
  const event = request.headers.get('x-github-event') || '';

  // Verify webhook signature
  if (GITHUB_WEBHOOK_SECRET && !verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only handle pull_request events
  if (event !== 'pull_request') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payload = JSON.parse(body);

  // Only handle merged PRs
  if (payload.action !== 'closed' || !payload.pull_request?.merged) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const pr = payload.pull_request;
  const prBody = pr.body || '';
  const githubUsername = pr.user?.login;

  const db = getDb();

  // Try to find the user by submission ID in the PR body
  const submissionMatch = prBody.match(/Submission ID:\s*(\S+)/);
  let user: any = null;

  if (submissionMatch) {
    const submissionId = submissionMatch[1];
    const submission = db.prepare(`
      SELECT s.submitter_id, u.id, u.email, u.contributor_status
      FROM submissions s JOIN users u ON s.submitter_id = u.id
      WHERE s.id = ?
    `).get(submissionId) as any;
    if (submission) user = submission;
  }

  // Fallback: try to find by github_username
  if (!user && githubUsername) {
    user = db.prepare('SELECT id, email, contributor_status FROM users WHERE github_username = ?').get(githubUsername) as any;
  }

  if (!user) {
    console.log(`[github-webhook] Merged PR but no linked Purroxy account found.`);
    return NextResponse.json({ ok: true, skipped: true, reason: 'no linked account' });
  }

  if (user.contributor_status === 'approved') {
    return NextResponse.json({ ok: true, already_approved: true });
  }

  // Grant contributor access — cancels Stripe subscription, sets status to active + approved
  await grantContributorAccess(user.id);

  console.log(`[github-webhook] Granted contributor access to ${user.email}`);

  return NextResponse.json({
    ok: true,
    granted: true,
    email: user.email,
  });
}
