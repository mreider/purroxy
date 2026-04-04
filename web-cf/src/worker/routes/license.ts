import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { getUserByLicenseKey } from '../lib/auth';

const license = new Hono<{ Bindings: Env }>();

const KV_TTL_SECONDS = 300; // 5 minutes

// POST /validate
license.post('/validate', async (c) => {
  // Accept license key from body or Authorization header
  let licenseKey: string | undefined;

  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    licenseKey = authHeader.slice(7).trim();
  }

  if (!licenseKey) {
    try {
      const body = await c.req.json<{ licenseKey?: string }>();
      licenseKey = body.licenseKey;
    } catch {
      // No valid JSON body
    }
  }

  if (!licenseKey) {
    return c.json({ valid: false, error: 'License key is required.' }, 400);
  }

  // Check KV cache first
  const cacheKey = `license:${licenseKey}`;
  const cached = await c.env.KV.get(cacheKey, 'json');
  if (cached) {
    const user = cached as User;
    return c.json({
      valid: true,
      userId: user.id,
      username: user.username,
      email: user.email,
      subscriptionStatus: user.subscription_status,
      contributorStatus: user.contributor_status,
      createdAt: user.created_at,
    });
  }

  // Fall back to D1
  const user = await getUserByLicenseKey(c.env.DB, licenseKey);
  if (!user) {
    return c.json({ valid: false }, 401);
  }

  // Cache in KV for 5 minutes
  await c.env.KV.put(cacheKey, JSON.stringify(user), {
    expirationTtl: KV_TTL_SECONDS,
  });

  return c.json({
    valid: true,
    userId: user.id,
    username: user.username,
    email: user.email,
    subscriptionStatus: user.subscription_status,
    contributorStatus: user.contributor_status,
    createdAt: user.created_at,
  });
});

export default license;
