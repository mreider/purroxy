import { getDb, generateId } from './db';

const FREE_EXECUTION_LIMIT = 5;

export interface UsageCheckResult {
  allowed: boolean;
  executionCount: number;
  limit: number;
  requiresSubscription: boolean;
}

export function checkUsage(userId: string, profileId: string, subscriptionStatus: string): UsageCheckResult {
  const db = getDb();

  const row = db.prepare(`
    SELECT execution_count FROM user_profiles
    WHERE user_id = ? AND profile_id = ?
  `).get(userId, profileId) as { execution_count: number } | undefined;

  const executionCount = row?.execution_count || 0;
  const isSubscribed = subscriptionStatus === 'active';

  if (isSubscribed) {
    return { allowed: true, executionCount, limit: -1, requiresSubscription: false };
  }

  const allowed = executionCount < FREE_EXECUTION_LIMIT;
  return {
    allowed,
    executionCount,
    limit: FREE_EXECUTION_LIMIT,
    requiresSubscription: !allowed,
  };
}

export function incrementUsage(userId: string, profileId: string): number {
  const db = getDb();

  const existing = db.prepare(`
    SELECT id, execution_count FROM user_profiles
    WHERE user_id = ? AND profile_id = ?
  `).get(userId, profileId) as { id: string; execution_count: number } | undefined;

  if (existing) {
    const newCount = existing.execution_count + 1;
    db.prepare(`
      UPDATE user_profiles SET execution_count = ?, last_executed_at = datetime('now')
      WHERE id = ?
    `).run(newCount, existing.id);
    return newCount;
  }

  // First time using this profile
  const id = generateId();
  db.prepare(`
    INSERT INTO user_profiles (id, user_id, profile_id, installed_version, execution_count, last_executed_at)
    VALUES (?, ?, ?, 1, 1, datetime('now'))
  `).run(id, userId, profileId);
  return 1;
}
