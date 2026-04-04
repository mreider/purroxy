import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, User } from './lib/types';
import { getUserByLicenseKey } from './lib/auth';
import authRoutes from './routes/auth';
import licenseRoutes from './routes/license';
import stripeRoutes from './routes/stripe';
import accountRoutes from './routes/account';
import submissionRoutes from './routes/submissions';
import githubWebhookRoutes from './routes/github-webhook';
import siteRoutes from './routes/sites';
import usageRoutes from './routes/usage';
import reviewRoutes from './routes/reviews';
import reportRoutes from './routes/reports';
import versionRoutes from './routes/version';

const app = new Hono<{ Bindings: Env }>();

// CORS for API routes
app.use('/api/*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Mount route groups
app.route('/api/auth', authRoutes);
app.route('/api/license', licenseRoutes);
app.route('/api/stripe', stripeRoutes);
app.route('/api/account', accountRoutes);
app.route('/api/submissions', submissionRoutes);
app.route('/api/github/webhook', githubWebhookRoutes);
app.route('/api/sites', siteRoutes);
app.route('/api/usage', usageRoutes);
app.route('/api/reviews', reviewRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/version', versionRoutes);

// Legacy compat: desktop app calls /api/profiles/:id/download
app.get('/api/profiles/:profileId/download', async (c) => {
  const key = c.req.header('authorization')?.replace('Bearer ', '');
  if (!key) return c.json({ error: 'License key required.' }, 401);
  const user = await getUserByLicenseKey(c.env.DB, key);
  if (!user) return c.json({ error: 'Invalid license key.' }, 401);

  const profileId = c.req.param('profileId');
  const [profileObj, authSpecObj, endpointsObj] = await Promise.all([
    c.env.R2.get(`packages/${profileId}/v1/profile.json`),
    c.env.R2.get(`packages/${profileId}/v1/auth-spec.json`),
    c.env.R2.get(`packages/${profileId}/v1/endpoints.json`),
  ]);

  if (!profileObj || !authSpecObj || !endpointsObj) {
    return c.json({ error: 'Package not found.' }, 404);
  }

  const [profileJson, authSpecJson, endpointsJson] = await Promise.all([
    profileObj.text(), authSpecObj.text(), endpointsObj.text(),
  ]);

  return c.json({
    files: {
      'profile.json': JSON.parse(profileJson),
      'auth-spec.json': JSON.parse(authSpecJson),
      'endpoints.json': JSON.parse(endpointsJson),
    },
  });
});

// Legacy compat: desktop app calls /api/profiles (list) and /api/profiles/:id (detail)
app.get('/api/profiles', async (c) => {
  // Redirect to /api/sites logic - read from KV index
  const cached = await c.env.KV.get('sites-index', 'text');
  if (!cached) return c.json({ profiles: [], total: 0 });
  const index = JSON.parse(cached);
  return c.json({ profiles: index.sites || [], total: (index.sites || []).length });
});

app.get('/api/profiles/:profileId', async (c) => {
  const profileId = c.req.param('profileId');
  const cached = await c.env.KV.get('sites-index', 'text');
  if (!cached) return c.json({ profile: null }, 404);
  const index = JSON.parse(cached);
  const site = (index.sites || []).find((s: any) => s.slug === profileId || s.id === profileId);
  return c.json({ profile: site || null });
});

// Health check
app.get('/api/health', (c) => c.json({ ok: true }));


export default app;
