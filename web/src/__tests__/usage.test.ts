import { describe, it, expect } from 'vitest';
import { getDb, generateId, generateLicenseKey } from '@/lib/db';
import { checkUsage, incrementUsage } from '@/lib/usage';

function createTestUser(email: string): { id: string; licenseKey: string } {
  const db = getDb();
  const id = generateId();
  const licenseKey = generateLicenseKey();
  db.prepare(`INSERT INTO users (id, email, password_hash, license_key) VALUES (?, ?, 'hash', ?)`).run(id, email, licenseKey);
  return { id, licenseKey };
}

function setSubscription(userId: string, status: string) {
  const db = getDb();
  db.prepare('UPDATE users SET subscription_status = ? WHERE id = ?').run(status, userId);
}

describe('usage check', () => {
  it('allows first execution for free user', () => {
    const user = createTestUser('free1@test.com');
    const result = checkUsage(user.id, 'profile-1', 'none');

    expect(result.allowed).toBe(true);
    expect(result.executionCount).toBe(0);
    expect(result.limit).toBe(5);
    expect(result.requiresSubscription).toBe(false);
  });

  it('allows up to 5 executions for free user', () => {
    const user = createTestUser('free5@test.com');
    for (let i = 0; i < 5; i++) {
      incrementUsage(user.id, 'profile-1');
    }

    const result = checkUsage(user.id, 'profile-1', 'none');
    expect(result.allowed).toBe(false);
    expect(result.executionCount).toBe(5);
    expect(result.requiresSubscription).toBe(true);
  });

  it('blocks 6th execution for free user', () => {
    const user = createTestUser('free6@test.com');
    for (let i = 0; i < 5; i++) {
      incrementUsage(user.id, 'profile-1');
    }

    const result = checkUsage(user.id, 'profile-1', 'none');
    expect(result.allowed).toBe(false);
    expect(result.requiresSubscription).toBe(true);
  });

  it('allows unlimited executions for subscribed user', () => {
    const user = createTestUser('sub@test.com');
    setSubscription(user.id, 'active');
    for (let i = 0; i < 20; i++) {
      incrementUsage(user.id, 'profile-1');
    }

    const result = checkUsage(user.id, 'profile-1', 'active');
    expect(result.allowed).toBe(true);
    expect(result.executionCount).toBe(20);
    expect(result.limit).toBe(-1);
    expect(result.requiresSubscription).toBe(false);
  });

  it('tracks usage per-profile independently', () => {
    const user = createTestUser('perprofile@test.com');
    for (let i = 0; i < 4; i++) {
      incrementUsage(user.id, 'profile-A');
    }
    incrementUsage(user.id, 'profile-B');

    const resultA = checkUsage(user.id, 'profile-A', 'none');
    const resultB = checkUsage(user.id, 'profile-B', 'none');

    expect(resultA.executionCount).toBe(4);
    expect(resultA.allowed).toBe(true);
    expect(resultB.executionCount).toBe(1);
    expect(resultB.allowed).toBe(true);
  });
});

describe('usage increment', () => {
  it('creates record on first increment', () => {
    const user = createTestUser('inc1@test.com');
    const count = incrementUsage(user.id, 'profile-new');
    expect(count).toBe(1);
  });

  it('increments existing record', () => {
    const user = createTestUser('inc2@test.com');
    incrementUsage(user.id, 'profile-inc');
    incrementUsage(user.id, 'profile-inc');
    const count = incrementUsage(user.id, 'profile-inc');
    expect(count).toBe(3);
  });

  it('returns accurate count after many increments', () => {
    const user = createTestUser('inc100@test.com');
    let count = 0;
    for (let i = 0; i < 10; i++) {
      count = incrementUsage(user.id, 'profile-many');
    }
    expect(count).toBe(10);
  });
});
