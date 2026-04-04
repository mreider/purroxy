import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env, User } from '../lib/types';
import {
  getStripe,
  createCheckoutSession,
  createBillingPortalSession,
  handleSubscriptionEvent,
} from '../lib/stripe';
import { verifySessionToken, getUserById, getUserByLicenseKey } from '../lib/auth';

const stripeRoutes = new Hono<{ Bindings: Env }>();

// Helper: resolve user from session cookie
async function getUserFromSession(c: any): Promise<User | null> {
  const token = getCookie(c, 'purroxy-session');
  if (!token) return null;
  const payload = await verifySessionToken(token, c.env.SESSION_SECRET);
  if (!payload) return null;
  return getUserById(c.env.DB, payload.userId);
}

// Helper: resolve user from license key in body
async function getUserFromLicenseBody(c: any, body: any): Promise<User | null> {
  const licenseKey = body?.licenseKey;
  if (!licenseKey) return null;
  return getUserByLicenseKey(c.env.DB, licenseKey);
}

// POST /create-checkout - session cookie auth
stripeRoutes.post('/create-checkout', async (c) => {
  const user = await getUserFromSession(c);
  if (!user) {
    return c.json({ error: 'Not authenticated.' }, 401);
  }

  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const url = await createCheckoutSession(
    stripe,
    c.env.DB,
    user.id,
    user.email,
    c.env.STRIPE_PRICE_ID,
    c.env.APP_URL,
  );

  return c.json({ url });
});

// POST /checkout-by-key - license key in body (for desktop app)
stripeRoutes.post('/checkout-by-key', async (c) => {
  let body: { licenseKey?: string } = {};
  try {
    body = await c.req.json<{ licenseKey?: string }>();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }
  const user = await getUserFromLicenseBody(c, body);
  if (!user) {
    return c.json({ error: 'Invalid license key.' }, 401);
  }

  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const url = await createCheckoutSession(
    stripe,
    c.env.DB,
    user.id,
    user.email,
    c.env.STRIPE_PRICE_ID,
    c.env.APP_URL,
  );

  return c.json({ url });
});

// POST /portal - session cookie OR license key in body
stripeRoutes.post('/portal', async (c) => {
  let user = await getUserFromSession(c);

  if (!user) {
    try {
      const body = await c.req.json<{ licenseKey?: string }>();
      user = await getUserFromLicenseBody(c, body);
    } catch {
      // No valid JSON body
    }
  }

  if (!user) {
    return c.json({ error: 'Not authenticated.' }, 401);
  }

  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const url = await createBillingPortalSession(stripe, c.env.DB, user.id, c.env.APP_URL);
  if (!url) {
    return c.json({ error: 'No billing account found. Subscribe first.' }, 400);
  }

  return c.json({ url });
});

// POST /webhook - Stripe signature verification
stripeRoutes.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing Stripe signature.' }, 400);
  }

  const rawBody = await c.req.text();
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err: any) {
    console.error('[stripe] Webhook signature verification failed:', err.message);
    return c.json({ error: 'Invalid signature.' }, 400);
  }

  try {
    await handleSubscriptionEvent(c.env.DB, c.env.KV, event);
  } catch (err: any) {
    console.error('[stripe] Error handling event:', err.message);
    return c.json({ error: 'Webhook handler failed.' }, 500);
  }

  return c.json({ received: true });
});

export default stripeRoutes;
