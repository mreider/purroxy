import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe';

initSchema();

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const licenseKey = body?.licenseKey;

  if (!licenseKey) {
    return NextResponse.json({ error: 'License key required.' }, { status: 400 });
  }

  const user = getUserByLicenseKey(licenseKey);
  if (!user) {
    return NextResponse.json({ error: 'Invalid license key. Log in first.' }, { status: 401 });
  }

  const checkoutUrl = await createCheckoutSession(user.id, user.email);
  if (!checkoutUrl) {
    return NextResponse.json({ error: 'Could not create checkout session.' }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutUrl });
}
