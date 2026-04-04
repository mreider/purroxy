import { createMiddleware } from 'hono/factory';
import type { Env, User } from '../lib/types';
import { getUserByLicenseKey } from '../lib/auth';

type LicenseAuthEnv = {
  Bindings: Env;
  Variables: { user: User };
};

const KV_TTL_SECONDS = 300; // 5 minutes

export const licenseAuth = createMiddleware<LicenseAuthEnv>(async (c, next) => {
  // Try Authorization header first
  let licenseKey = '';
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    licenseKey = authHeader.slice(7).trim();
  }

  // Fall back to request body (some desktop endpoints send licenseKey in body)
  if (!licenseKey) {
    try {
      const body = await c.req.json() as any;
      licenseKey = body?.licenseKey || '';
    } catch {
      // Body may not be JSON or already consumed
    }
  }

  if (!licenseKey) {
    return c.json({ error: 'Missing license key.' }, 401);
  }

  // Check KV cache first
  const cacheKey = `license:${licenseKey}`;
  const cached = await c.env.KV.get(cacheKey, 'json');
  if (cached) {
    c.set('user', cached as User);
    await next();
    return;
  }

  // Fall back to D1
  const user = await getUserByLicenseKey(c.env.DB, licenseKey);
  if (!user) {
    return c.json({ error: 'Invalid license key.' }, 401);
  }

  // Cache in KV for 5 minutes
  await c.env.KV.put(cacheKey, JSON.stringify(user), {
    expirationTtl: KV_TTL_SECONDS,
  });

  c.set('user', user);
  await next();
});
