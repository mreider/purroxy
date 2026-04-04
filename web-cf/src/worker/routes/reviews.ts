import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { randomUUID } from '../lib/crypto';
import { licenseAuth } from '../middleware/license-auth';

type HonoEnv = { Bindings: Env; Variables: { user: User } };

const app = new Hono<HonoEnv>();

// --- GET / --- list reviews for a site (public)

app.get('/', async (c) => {
  const siteSlug = c.req.query('siteSlug');
  if (!siteSlug) {
    return c.json({ error: 'siteSlug query param required.' }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT r.rating, r.review_text, r.created_at,
            u.username, u.username AS display_name
     FROM reviews r
     LEFT JOIN users u ON r.user_id = u.id
     WHERE r.site_slug = ?
     ORDER BY r.created_at DESC
     LIMIT 50`,
  )
    .bind(siteSlug)
    .all();

  return c.json({ reviews: results ?? [] });
});

// --- POST / --- create or update a review (license auth)

app.post('/', licenseAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body?.siteSlug || !body?.rating) {
    return c.json({ error: 'siteSlug and rating are required.' }, 400);
  }

  const rating = parseInt(body.rating, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return c.json({ error: 'Rating must be 1-5.' }, 400);
  }

  const siteSlug = body.siteSlug as string;
  const reviewText = (body.reviewText as string) || null;

  // Upsert: one review per user per site
  const existing = await c.env.DB.prepare(
    'SELECT id FROM reviews WHERE site_slug = ? AND user_id = ?',
  )
    .bind(siteSlug, user.id)
    .first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE reviews SET rating = ?, review_text = ?, created_at = datetime('now') WHERE id = ?`,
    )
      .bind(rating, reviewText, existing.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO reviews (id, site_slug, user_id, rating, review_text) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(randomUUID(), siteSlug, user.id, rating, reviewText)
      .run();
  }

  // Recompute average rating for this site slug
  const avg = await c.env.DB.prepare(
    'SELECT AVG(rating) as avg FROM reviews WHERE site_slug = ?',
  )
    .bind(siteSlug)
    .first<{ avg: number | null }>();

  const averageRating = avg?.avg ? Math.round(avg.avg * 10) / 10 : null;

  return c.json({ success: true, averageRating }, existing ? 200 : 201);
});

export default app;
