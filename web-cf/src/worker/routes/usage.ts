import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { randomUUID } from '../lib/crypto';
import { licenseAuth } from '../middleware/license-auth';

type HonoEnv = { Bindings: Env; Variables: { user: User } };

const app = new Hono<HonoEnv>();

app.use('*', licenseAuth);

const FREE_LIMIT = 5;

function isPaid(user: User): boolean {
  return (
    user.subscription_status === 'active' ||
    user.subscription_status === 'trialing' ||
    user.contributor_status === 'approved'
  );
}

// --- POST /check --- check if user can execute

app.post('/check', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const profileId = body?.profileId;

  if (!profileId) {
    return c.json({ error: 'profileId is required.' }, 400);
  }

  const record = await c.env.DB.prepare(
    'SELECT execution_count FROM user_profiles WHERE user_id = ? AND profile_id = ?',
  )
    .bind(user.id, profileId)
    .first<{ execution_count: number }>();

  const executionCount = record?.execution_count ?? 0;
  const paid = isPaid(user);
  const limit = paid ? null : FREE_LIMIT;
  const allowed = paid || executionCount < FREE_LIMIT;

  return c.json({
    allowed,
    executionCount,
    limit,
    requiresSubscription: !paid && !allowed,
  });
});

// --- POST /increment --- increment execution count

app.post('/increment', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const profileId = body?.profileId;

  if (!profileId) {
    return c.json({ error: 'profileId is required.' }, 400);
  }

  // Check usage first
  const record = await c.env.DB.prepare(
    'SELECT execution_count FROM user_profiles WHERE user_id = ? AND profile_id = ?',
  )
    .bind(user.id, profileId)
    .first<{ execution_count: number }>();

  const executionCount = record?.execution_count ?? 0;
  const paid = isPaid(user);

  if (!paid && executionCount >= FREE_LIMIT) {
    return c.json(
      {
        error: 'Usage limit reached. Subscribe to continue.',
        allowed: false,
        executionCount,
        limit: FREE_LIMIT,
        requiresSubscription: true,
      },
      403,
    );
  }

  const now = new Date().toISOString();

  if (record) {
    // Update existing record
    await c.env.DB.prepare(
      `UPDATE user_profiles SET execution_count = execution_count + 1, last_executed_at = ? WHERE user_id = ? AND profile_id = ?`,
    )
      .bind(now, user.id, profileId)
      .run();
  } else {
    // Insert new record
    await c.env.DB.prepare(
      `INSERT INTO user_profiles (id, user_id, profile_id, execution_count, last_executed_at, acquired_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
      .bind(randomUUID(), user.id, profileId, now, now)
      .run();
  }

  return c.json({ executionCount: executionCount + 1 });
});

export default app;
