import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { verifySessionToken, getUserById } from '@/lib/auth';
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe';

initSchema();

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  const token = request.cookies.get('purroxy-session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });
  }

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const checkoutUrl = await createCheckoutSession(user.id, user.email);
  if (!checkoutUrl) {
    return NextResponse.json({ error: 'Could not create checkout session.' }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutUrl });
}
