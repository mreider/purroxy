import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { randomUUID } from '../lib/crypto';
import { validateProfilePackage } from '../lib/validation';
import { createSitePR, getPRState, getPRCloseComment } from '../lib/github';
import { grantContributorAccess, getStripe } from '../lib/stripe';
import { sendSiteApproved, sendSiteRejected } from '../lib/email';
import { licenseAuth } from '../middleware/license-auth';

type HonoEnv = { Bindings: Env; Variables: { user: User } };

const app = new Hono<HonoEnv>();

app.use('*', licenseAuth);

// --- Shared helpers ---

async function processApproval(
  env: Env,
  submission: { id: string; username: string; site_slug: string | null },
): Promise<void> {
  const now = new Date().toISOString();

  // Mark submission approved
  await env.DB.prepare(
    `UPDATE submissions SET status = 'approved', reviewed_at = ? WHERE id = ?`,
  )
    .bind(now, submission.id)
    .run();

  // Find the submitter by username
  const user = await env.DB.prepare(
    'SELECT id, email, contributor_status FROM users WHERE username = ?',
  )
    .bind(submission.username)
    .first<{ id: string; email: string; contributor_status: string }>();

  if (!user) return;

  // Grant contributor access
  if (user.contributor_status !== 'approved') {
    const stripe = getStripe(env.STRIPE_SECRET_KEY);
    await grantContributorAccess(stripe, env.DB, env.KV, user.id);
  }

  // Send approval email
  const siteName = submission.site_slug || 'your site';
  await sendSiteApproved(
    env.MAILGUN_API_KEY,
    env.MAILGUN_DOMAIN,
    env.APP_URL,
    user.email,
    siteName,
  ).catch(() => {});
}

async function processRejection(
  env: Env,
  submission: { id: string; username: string; site_slug: string | null; github_pr_number: number | null },
  reason: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE submissions SET status = 'rejected', rejection_reason = ?, reviewed_at = ? WHERE id = ?`,
  )
    .bind(reason, now, submission.id)
    .run();

  const user = await env.DB.prepare(
    'SELECT email FROM users WHERE username = ?',
  )
    .bind(submission.username)
    .first<{ email: string }>();

  if (user?.email) {
    const siteName = submission.site_slug || 'your site';
    await sendSiteRejected(
      env.MAILGUN_API_KEY,
      env.MAILGUN_DOMAIN,
      env.APP_URL,
      user.email,
      siteName,
      reason || 'No reason provided.',
    ).catch(() => {});
  }
}

// --- GET / --- check submission status (with polling fallback)

app.get('/', async (c) => {
  const user = c.get('user');
  const siteSlug = c.req.query('profileId');
  if (!siteSlug) {
    return c.json({ error: 'profileId query param required.' }, 400);
  }

  const submission = await c.env.DB.prepare(
    `SELECT id, status, rejection_reason, created_at, reviewed_at,
            username, github_pr_url, github_pr_number, site_slug, submission_type
     FROM submissions
     WHERE username = ? AND site_slug = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(user.username, siteSlug)
    .first<{
      id: string;
      username: string;
      status: string;
      rejection_reason: string | null;
      created_at: string;
      reviewed_at: string | null;
      github_pr_url: string | null;
      github_pr_number: number | null;
      site_slug: string | null;
      submission_type: string;
    }>();

  if (!submission) {
    return c.json({ submitted: false });
  }

  // Polling fallback: if still pending and we have a PR number, check GitHub
  if (submission.status === 'pending' && submission.github_pr_number) {
    const prState = await getPRState(c.env.GITHUB_TOKEN, submission.github_pr_number);
    if (prState && prState.state === 'closed') {
      if (prState.merged) {
        await processApproval(c.env, submission);
        submission.status = 'approved';
        submission.reviewed_at = prState.mergedAt;
      } else {
        const reason = await getPRCloseComment(c.env.GITHUB_TOKEN, submission.github_pr_number);
        await processRejection(c.env, submission, reason);
        submission.status = 'rejected';
        submission.rejection_reason = reason;
        submission.reviewed_at = prState.closedAt;
      }
    }
  }

  return c.json({
    submitted: true,
    submissionId: submission.id,
    status: submission.status,
    rejectionReason: submission.rejection_reason,
    submittedAt: submission.created_at,
    reviewedAt: submission.reviewed_at,
    githubPrUrl: submission.github_pr_url,
    submissionType: submission.submission_type,
  });
});

// --- POST / --- create a new submission

app.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body?.profileJson || !body?.authSpecJson || !body?.endpointsJson) {
    return c.json(
      { error: 'profileJson, authSpecJson, and endpointsJson are required.' },
      400,
    );
  }

  const profileJson =
    typeof body.profileJson === 'string'
      ? body.profileJson
      : JSON.stringify(body.profileJson);
  const authSpecJson =
    typeof body.authSpecJson === 'string'
      ? body.authSpecJson
      : JSON.stringify(body.authSpecJson);
  const endpointsJson =
    typeof body.endpointsJson === 'string'
      ? body.endpointsJson
      : JSON.stringify(body.endpointsJson);

  // Validate the package
  const validation = validateProfilePackage(profileJson, authSpecJson, endpointsJson);
  if (!validation.valid) {
    return c.json({ error: 'Profile validation failed.', validation }, 422);
  }

  const profile = JSON.parse(profileJson);
  const siteBaseUrl = profile.siteBaseUrl || '';

  // Check if site_slug already exists in the sites index (KV)
  let existingSiteSlug: string | undefined;
  const sitesRaw = await c.env.KV.get('sites-index', 'text');
  if (sitesRaw) {
    try {
      const sites: { slug: string; siteUrl?: string }[] = JSON.parse(sitesRaw);
      const match = sites.find((s) => s.siteUrl === siteBaseUrl);
      if (match) existingSiteSlug = match.slug;
    } catch {
      // ignore parse errors
    }
  }

  const submissionType = existingSiteSlug ? 'add_capability' : 'new_site';
  const submissionId = randomUUID();

  // Create GitHub PR
  const prResult = await createSitePR(c.env.GITHUB_TOKEN, {
    siteName: profile.name || profile.siteName || 'site',
    displayName: profile.name || profile.siteName,
    description: profile.description || `Site: ${profile.siteName}`,
    siteUrl: siteBaseUrl,
    capabilities: (body.capabilities as string[]) || [],
    submitterUsername: user.username,
    submissionId,
    profileJson,
    authSpecJson,
    endpointsJson,
    existingSiteSlug,
  });

  const prNumber = prResult?.prNumber ?? null;
  const prUrl = prResult?.prUrl ?? null;
  const siteSlug = prResult?.slug ?? existingSiteSlug ?? null;

  // Store submission in D1
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, username, site_slug, submission_type, github_pr_number, github_pr_url, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
  )
    .bind(submissionId, user.username, siteSlug, submissionType, prNumber, prUrl)
    .run();

  return c.json(
    {
      submissionId,
      status: 'pending',
      githubPr: prUrl,
      githubPrUrl: prUrl,
      submissionType,
      siteSlug,
    },
    201,
  );
});

export { processApproval, processRejection };
export default app;
