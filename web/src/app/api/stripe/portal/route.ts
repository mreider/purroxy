import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { verifySessionToken, getUserByLicenseKey } from '@/lib/auth';
import { createBillingPortalSession, isStripeConfigured } from '@/lib/stripe';

initSchema();

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  let userId: string | null = null;

  // Try license key from body (desktop app)
  const body = await request.json().catch(() => null);
  if (body?.licenseKey) {
    const user = getUserByLicenseKey(body.licenseKey);
    if (user) userId = user.id;
  }

  // Fall back to session cookie (web)
  if (!userId) {
    const token = request.cookies.get('purroxy-session')?.value;
    if (token) {
      const session = verifySessionToken(token);
      if (session) userId = session.userId;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const portalUrl = await createBillingPortalSession(userId);
  if (!portalUrl) {
    return NextResponse.json({ error: 'Could not create portal session. You may need to subscribe first.' }, { status: 500 });
  }

  return NextResponse.json({ url: portalUrl });
}
