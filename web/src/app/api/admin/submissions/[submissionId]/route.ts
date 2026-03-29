import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';
import { approveSubmission, rejectSubmission } from '@/lib/profiles';
import { sendSiteApproved, sendSiteRejected } from '@/lib/email';
import { mergeSitePR, closeSitePR } from '@/lib/github';

initSchema();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;
  const body = await request.json().catch(() => null);

  if (!body?.action || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action must be "approve" or "reject".' }, { status: 400 });
  }

  const db = getDb();
  const submission = db.prepare(`
    SELECT s.profile_id, s.submitter_id, s.github_pr_number,
           p.name as profile_name,
           u.email as creator_email
    FROM submissions s
    JOIN profiles p ON s.profile_id = p.id
    JOIN users u ON s.submitter_id = u.id
    WHERE s.id = ?
  `).get(submissionId) as any;

  if (body.action === 'approve') {
    approveSubmission(submissionId, 'admin');

    // Merge the GitHub PR — this triggers the webhook which grants contributor access
    if (submission?.github_pr_number) {
      await mergeSitePR(submission.github_pr_number);
    }

    if (submission?.creator_email) {
      sendSiteApproved(submission.creator_email, submission.profile_name).catch(() => {});
    }
  } else {
    if (!body.reason) {
      return NextResponse.json({ error: 'reason is required for rejection.' }, { status: 400 });
    }
    rejectSubmission(submissionId, 'admin', body.reason);

    // Close the GitHub PR without merging
    if (submission?.github_pr_number) {
      await closeSitePR(submission.github_pr_number);
    }

    if (submission?.creator_email) {
      sendSiteRejected(submission.creator_email, submission.profile_name, body.reason).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
