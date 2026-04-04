import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { licenseAuth } from '../middleware/license-auth';

type HonoEnv = { Bindings: Env; Variables: { user: User } };

const app = new Hono<HonoEnv>();

// --- GET / --- list all sites (public)

app.get('/', async (c) => {
  const search = c.req.query('search')?.toLowerCase();

  const raw = await c.env.KV.get('sites-index', 'text');
  if (!raw) {
    return c.json({ sites: [], total: 0 });
  }

  let sites: any[];
  try {
    sites = JSON.parse(raw);
  } catch {
    return c.json({ sites: [], total: 0 });
  }

  if (search) {
    sites = sites.filter(
      (s: any) =>
        (s.name && s.name.toLowerCase().includes(search)) ||
        (s.description && s.description.toLowerCase().includes(search)),
    );
  }

  return c.json({ sites, total: sites.length });
});

// --- GET /:slug --- single site (public)

app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  // Avoid matching the literal "download" path segment at this level
  if (slug === 'download') {
    return c.json({ error: 'Slug required.' }, 400);
  }

  const raw = await c.env.KV.get('sites-index', 'text');
  if (!raw) {
    return c.json({ error: 'Site not found.' }, 404);
  }

  let sites: any[];
  try {
    sites = JSON.parse(raw);
  } catch {
    return c.json({ error: 'Site not found.' }, 404);
  }

  const site = sites.find((s: any) => s.slug === slug);
  if (!site) {
    return c.json({ error: 'Site not found.' }, 404);
  }

  return c.json({ site });
});

// --- GET /:slug/download --- download profile package (license auth)

app.get('/:slug/download', licenseAuth, async (c) => {
  const slug = c.req.param('slug');

  // Read the three profile files from R2
  const [profileObj, authSpecObj, endpointsObj] = await Promise.all([
    c.env.R2.get(`packages/${slug}/v1/profile.json`),
    c.env.R2.get(`packages/${slug}/v1/auth-spec.json`),
    c.env.R2.get(`packages/${slug}/v1/endpoints.json`),
  ]);

  if (!profileObj || !authSpecObj || !endpointsObj) {
    return c.json({ error: 'Package not found.' }, 404);
  }

  const [profileJson, authSpecJson, endpointsJson] = await Promise.all([
    profileObj.text(),
    authSpecObj.text(),
    endpointsObj.text(),
  ]);

  return c.json({
    profileJson: JSON.parse(profileJson),
    authSpecJson: JSON.parse(authSpecJson),
    endpointsJson: JSON.parse(endpointsJson),
  });
});

export default app;
