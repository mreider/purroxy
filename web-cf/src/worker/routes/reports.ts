import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { randomUUID } from '../lib/crypto';
import { licenseAuth } from '../middleware/license-auth';

type HonoEnv = { Bindings: Env; Variables: { user: User } };

const app = new Hono<HonoEnv>();

app.use('*', licenseAuth);

// --- POST / --- file a bug report

app.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body?.siteSlug) {
    return c.json({ error: 'siteSlug is required.' }, 400);
  }

  const id = randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO bug_reports (id, site_slug, reporter_id, endpoint_name, error_status, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.siteSlug,
      user.id,
      body.endpointName || null,
      body.errorStatus || null,
      body.errorMessage || null,
    )
    .run();

  return c.json({ success: true, reportId: id }, 201);
});

export default app;
