import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getStripe, getWebhookSecret, handleSubscriptionEvent } from '@/lib/stripe';

initSchema();

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured.' }, { status: 503 });
  }

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = getWebhookSecret();

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret.' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  handleSubscriptionEvent(event);

  return NextResponse.json({ received: true });
}
