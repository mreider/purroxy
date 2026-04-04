import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Env, User } from '../lib/types';
import { verifySessionToken, getUserById } from '../lib/auth';

type SessionAuthEnv = {
  Bindings: Env;
  Variables: { user: User };
};

export const sessionAuth = createMiddleware<SessionAuthEnv>(async (c, next) => {
  const token = getCookie(c, 'purroxy-session');
  if (!token) {
    return c.json({ error: 'Not authenticated.' }, 401);
  }

  const payload = await verifySessionToken(token, c.env.SESSION_SECRET);
  if (!payload) {
    return c.json({ error: 'Invalid or expired session.' }, 401);
  }

  const user = await getUserById(c.env.DB, payload.userId);
  if (!user) {
    return c.json({ error: 'User not found.' }, 401);
  }

  c.set('user', user);
  await next();
});
