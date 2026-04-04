import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb, generateId, initSchema } from '@/lib/db';
import { grantContributorAccess } from '@/lib/stripe';
import { getPRCloseComment } from '@/lib/github';
import { sendSiteApproved, sendSiteRejected } from '@/lib/email';

initSchema();

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

function verifySignature(payload: string, signature: string): boolean {
  if (!GITHUB_WEBHOOK_SECRET) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Shared logic for processing an approved submission (PR merged).
// Used by both the webhook and the polling fallback in the submissions API.
export async function processApproval(submission: any): Promise<void> {
  const db = getDb();

  // Mark submission approved
  db.prepare(`
    UPDATE submissions SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?
  `).run(submission.id);

  // Mark the profile approved too
  db.prepare(`
    UPDATE profiles SET status = 'approved', published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(submission.profile_id);

  // Create or update the sites table entry
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(submission.profile_id) as any;
  if (profile) {
    const slug = submission.site_slug || profile.site_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    const existingSite = db.prepare('SELECT * FROM sites WHERE slug = ?').get(slug) as any;

    if (existingSite) {
      // Capability addition: merge capabilities
      const existingCaps: string[] = JSON.parse(existingSite.capabilities || '[]');
      const profileCaps: string[] = JSON.parse(profile.tags || '[]');
      const merged = [...new Set([...existingCaps, ...profileCaps])];

      db.prepare(`
        UPDATE sites SET capabilities = ?, profile_id = ?, updated_at = datetime('now') WHERE slug = ?
      `).run(JSON.stringify(merged), profile.id, slug);
    } else {
      // New site
      const user = db.prepare('SELECT display_name, email, github_username FROM users WHERE id = ?')
        .get(profile.creator_id) as any;
      const author = user?.github_username || user?.display_name || user?.email || 'Unknown';

      db.prepare(`
        INSERT INTO sites (id, slug, name, description, site_url, capabilities, author, profile_id, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        generateId(), slug, profile.name, profile.description,
        profile.site_base_url, JSON.stringify(profile.tags || []),
        author, profile.id
      );
    }
  }

  // Grant contributor access to the submitter
  const user = db.prepare('SELECT id, email, contributor_status FROM users WHERE id = ?')
    .get(submission.submitter_id) as any;

  if (user && user.contributor_status !== 'approved') {
    await grantContributorAccess(user.id);
    console.log(`[github-webhook] Granted contributor access to ${user.email}`);
  }

  // Send approval email
  if (user?.email && profile?.name) {
    sendSiteApproved(user.email, profile.name).catch(() => {});
  }
}

// Shared logic for processing a rejected submission (PR closed without merge).
export async function processRejection(submission: any, reason: string | null): Promise<void> {
  const db = getDb();

  db.prepare(`
    UPDATE submissions SET status = 'rejected', rejection_reason = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(reason, submission.id);

  // Send rejection email
  const profile = db.prepare('SELECT name FROM profiles WHERE id = ?').get(submission.profile_id) as any;
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(submission.submitter_id) as any;

  if (user?.email && profile?.name) {
    sendSiteRejected(user.email, profile.name, reason || 'No reason provided.').catch(() => {});
  }
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

  // Only handle closed PRs (both merged and closed-without-merge)
  if (payload.action !== 'closed') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const pr = payload.pull_request;
  const prNumber = pr.number;
  const merged = !!pr.merged;

  const db = getDb();

  // Look up submission by PR number
  const submission = db.prepare(`
    SELECT s.*, u.email, u.contributor_status
    FROM submissions s
    JOIN users u ON s.submitter_id = u.id
    WHERE s.github_pr_number = ?
  `).get(prNumber) as any;

  if (!submission) {
    console.log(`[github-webhook] Closed PR #${prNumber} but no matching submission found.`);
    return NextResponse.json({ ok: true, skipped: true, reason: 'no matching submission' });
  }

  if (submission.status !== 'pending') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already processed' });
  }

  if (merged) {
    await processApproval(submission);
    return NextResponse.json({ ok: true, approved: true, email: submission.email });
  } else {
    const reason = await getPRCloseComment(prNumber);
    await processRejection(submission, reason);
    return NextResponse.json({ ok: true, rejected: true, email: submission.email });
  }
}
