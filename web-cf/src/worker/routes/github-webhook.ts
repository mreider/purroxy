import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { hmacSign } from '../lib/crypto';
import { getPRCloseComment } from '../lib/github';
import { grantContributorAccess, getStripe } from '../lib/stripe';
import { sendSiteApproved, sendSiteRejected } from '../lib/email';

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

// Constant-time hex comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

app.post('/', async (c) => {
  const body = await c.req.text();
  const signatureHeader = c.req.header('x-hub-signature-256') || '';
  const event = c.req.header('x-github-event') || '';

  // Verify webhook signature
  if (c.env.GITHUB_WEBHOOK_SECRET) {
    if (!signatureHeader) {
      return c.json({ error: 'Missing signature.' }, 401);
    }

    const expectedHex = await hmacSign(c.env.GITHUB_WEBHOOK_SECRET, body);
    const expected = `sha256=${expectedHex}`;

    if (!timingSafeEqual(expected, signatureHeader)) {
      return c.json({ error: 'Invalid signature.' }, 401);
    }
  }

  // Only handle pull_request events
  if (event !== 'pull_request') {
    return c.json({ ok: true, skipped: true });
  }

  const payload = JSON.parse(body);

  // Only handle closed PRs
  if (payload.action !== 'closed') {
    return c.json({ ok: true, skipped: true });
  }

  const pr = payload.pull_request;
  const prNumber = pr.number;
  const merged = !!pr.merged;

  // Look up submission by PR number
  const submission = await c.env.DB.prepare(
    `SELECT s.id, s.username, s.site_slug, s.status, s.github_pr_number
     FROM submissions s
     WHERE s.github_pr_number = ?`,
  )
    .bind(prNumber)
    .first<{
      id: string;
      username: string;
      site_slug: string | null;
      status: string;
      github_pr_number: number;
    }>();

  if (!submission) {
    return c.json({ ok: true, skipped: true, reason: 'no matching submission' });
  }

  if (submission.status !== 'pending') {
    return c.json({ ok: true, skipped: true, reason: 'already processed' });
  }

  const now = new Date().toISOString();

  if (merged) {
    // --- Approval ---
    await c.env.DB.prepare(
      `UPDATE submissions SET status = 'approved', reviewed_at = ? WHERE id = ?`,
    )
      .bind(now, submission.id)
      .run();

    // Grant contributor access
    const user = await c.env.DB.prepare(
      'SELECT id, email, contributor_status FROM users WHERE username = ?',
    )
      .bind(submission.username)
      .first<{ id: string; email: string; contributor_status: string }>();

    if (user) {
      if (user.contributor_status !== 'approved') {
        const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
        await grantContributorAccess(stripe, c.env.DB, c.env.KV, user.id);
      }

      const siteName = submission.site_slug || 'your site';
      await sendSiteApproved(
        c.env.MAILGUN_API_KEY,
        c.env.MAILGUN_DOMAIN,
        c.env.APP_URL,
        user.email,
        siteName,
      ).catch(() => {});
    }

    return c.json({ ok: true, approved: true });
  } else {
    // --- Rejection ---
    const reason = await getPRCloseComment(c.env.GITHUB_TOKEN, prNumber);

    await c.env.DB.prepare(
      `UPDATE submissions SET status = 'rejected', rejection_reason = ?, reviewed_at = ? WHERE id = ?`,
    )
      .bind(reason, now, submission.id)
      .run();

    const user = await c.env.DB.prepare(
      'SELECT email FROM users WHERE username = ?',
    )
      .bind(submission.username)
      .first<{ email: string }>();

    if (user?.email) {
      const siteName = submission.site_slug || 'your site';
      await sendSiteRejected(
        c.env.MAILGUN_API_KEY,
        c.env.MAILGUN_DOMAIN,
        c.env.APP_URL,
        user.email,
        siteName,
        reason || 'No reason provided.',
      ).catch(() => {});
    }

    return c.json({ ok: true, rejected: true });
  }
});

export default app;
