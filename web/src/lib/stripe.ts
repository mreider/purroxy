import Stripe from 'stripe';
import { getDb } from './db';
import { sendSubscriptionConfirmation } from './email';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || ''; // $3.89/mo price
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://purroxy.com';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY && !!STRIPE_PRICE_ID;
}

export function getWebhookSecret(): string {
  return STRIPE_WEBHOOK_SECRET;
}

export async function createCheckoutSession(userId: string, email: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe || !STRIPE_PRICE_ID) return null;

  const db = getDb();
  const user = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(userId) as any;

  let customerId = user?.stripe_customer_id;

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({ email, metadata: { userId } });
    customerId = customer.id;
    db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId },
    },
    success_url: `${APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/pricing`,
    metadata: { userId },
  });

  return session.url;
}

export function handleSubscriptionEvent(event: Stripe.Event): void {
  const db = getDb();

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status;

      db.prepare(`
        UPDATE users SET subscription_status = ?, subscription_stripe_id = ?, updated_at = datetime('now')
        WHERE stripe_customer_id = ?
      `).run(status, sub.id, customerId);

      // Send confirmation email on new active subscription
      if (status === 'active' && event.type === 'customer.subscription.created') {
        const user = db.prepare('SELECT email, display_name FROM users WHERE stripe_customer_id = ?').get(customerId) as any;
        if (user?.email) {
          sendSubscriptionConfirmation(user.email, user.display_name).catch(() => {});
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      // Don't downgrade approved contributors — they keep access even after Stripe sub is cancelled
      db.prepare(`
        UPDATE users SET subscription_status = 'canceled', updated_at = datetime('now')
        WHERE stripe_customer_id = ? AND contributor_status != 'approved'
      `).run(customerId);
      break;
    }
  }
}

export async function grantContributorAccess(userId: string): Promise<void> {
  const db = getDb();
  const stripe = getStripe();

  // Mark user as approved contributor with permanent access
  db.prepare(`
    UPDATE users SET contributor_status = 'approved', subscription_status = 'active', updated_at = datetime('now')
    WHERE id = ?
  `).run(userId);

  // If they have an active paid subscription, cancel it so they stop being charged
  if (stripe) {
    const user = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(userId) as any;
    if (user?.stripe_customer_id) {
      try {
        const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'active' });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
        // Also cancel trialing subs
        const trialSubs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'trialing' });
        for (const sub of trialSubs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      } catch { /* if no subs, that's fine */ }
    }
  }
}

export async function createBillingPortalSession(userId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const db = getDb();
  const user = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(userId) as any;
  if (!user?.stripe_customer_id) return null;

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${APP_URL}/dashboard`,
  });

  return session.url;
}
