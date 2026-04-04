// Stripe integration for Cloudflare Workers with D1 + KV

import Stripe from 'stripe';
import type { Env, User } from './types';

export function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

export async function createCheckoutSession(
  stripe: Stripe,
  db: D1Database,
  userId: string,
  email: string,
  priceId: string,
  appUrl: string
): Promise<string> {
  // Look up existing Stripe customer ID
  const user = await db
    .prepare('SELECT stripe_customer_id, username FROM users WHERE id = ?')
    .bind(userId)
    .first<Pick<User, 'stripe_customer_id' | 'username'>>();

  let customerId = user?.stripe_customer_id;

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId, username: user?.username || '' },
    });
    customerId = customer.id;
    await db
      .prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
      .bind(customerId, userId)
      .run();
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId },
    },
    success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing`,
    metadata: { userId },
  });

  return session.url!;
}

export async function createBillingPortalSession(
  stripe: Stripe,
  db: D1Database,
  userId: string,
  appUrl: string
): Promise<string | null> {
  const user = await db
    .prepare('SELECT stripe_customer_id FROM users WHERE id = ?')
    .bind(userId)
    .first<Pick<User, 'stripe_customer_id'>>();

  if (!user?.stripe_customer_id) return null;

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${appUrl}/dashboard`,
  });

  return session.url;
}

export async function handleSubscriptionEvent(
  db: D1Database,
  kv: KVNamespace,
  event: any
): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const customerId = sub.customer as string;
      const status =
        sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status;

      await db
        .prepare(
          `UPDATE users SET subscription_status = ?, subscription_stripe_id = ?, updated_at = datetime('now')
           WHERE stripe_customer_id = ?`
        )
        .bind(status, sub.id, customerId)
        .run();

      // Invalidate KV license cache so next license check gets fresh data
      await invalidateKVCache(db, kv, customerId);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const customerId = sub.customer as string;

      // Don't downgrade approved contributors -- they keep access even after Stripe sub is cancelled
      await db
        .prepare(
          `UPDATE users SET subscription_status = 'canceled', updated_at = datetime('now')
           WHERE stripe_customer_id = ? AND contributor_status != 'approved'`
        )
        .bind(customerId)
        .run();

      // Invalidate KV license cache
      await invalidateKVCache(db, kv, customerId);
      break;
    }
  }
}

export async function grantContributorAccess(
  stripe: Stripe | null,
  db: D1Database,
  kv: KVNamespace,
  userId: string
): Promise<void> {
  // Mark user as approved contributor with permanent access
  await db
    .prepare(
      `UPDATE users SET contributor_status = 'approved', subscription_status = 'active', updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(userId)
    .run();

  // If they have an active paid subscription, cancel it so they stop being charged
  if (stripe) {
    const user = await db
      .prepare('SELECT stripe_customer_id FROM users WHERE id = ?')
      .bind(userId)
      .first<Pick<User, 'stripe_customer_id'>>();

    if (user?.stripe_customer_id) {
      try {
        const activeSubs = await stripe.subscriptions.list({
          customer: user.stripe_customer_id,
          status: 'active',
        });
        for (const sub of activeSubs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
        // Also cancel trialing subs
        const trialSubs = await stripe.subscriptions.list({
          customer: user.stripe_customer_id,
          status: 'trialing',
        });
        for (const sub of trialSubs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      } catch {
        /* if no subs, that's fine */
      }
    }
  }

  // Invalidate KV license cache
  const user = await db
    .prepare('SELECT license_key FROM users WHERE id = ?')
    .bind(userId)
    .first<Pick<User, 'license_key'>>();

  if (user?.license_key) {
    await kv.delete(`license:${user.license_key}`);
  }
}

// Helper: invalidate the KV license cache for a user identified by their Stripe customer ID
async function invalidateKVCache(
  db: D1Database,
  kv: KVNamespace,
  stripeCustomerId: string
): Promise<void> {
  const user = await db
    .prepare('SELECT license_key FROM users WHERE stripe_customer_id = ?')
    .bind(stripeCustomerId)
    .first<Pick<User, 'license_key'>>();

  if (user?.license_key) {
    await kv.delete(`license:${user.license_key}`);
  }
}
