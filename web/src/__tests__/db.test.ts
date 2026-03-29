import { describe, it, expect } from 'vitest';
import { getDb, generateId, generateLicenseKey } from '@/lib/db';

describe('database', () => {
  it('creates all tables on init', () => {
    const db = getDb();
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('profiles');
    expect(tableNames).toContain('profile_versions');
    expect(tableNames).toContain('user_profiles');
    expect(tableNames).toContain('submissions');
    expect(tableNames).toContain('bug_reports');
    expect(tableNames).toContain('reviews');
  });

  it('enforces foreign keys', () => {
    const db = getDb();
    expect(() => {
      db.prepare(`
        INSERT INTO profiles (id, creator_id, name, site_name, site_base_url, auth_type, checksum)
        VALUES ('p1', 'nonexistent-user', 'Test', 'Test', 'https://test.com', 'cookie', 'abc')
      `).run();
    }).toThrow();
  });

  it('enforces unique email constraint', () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, license_key) VALUES ('u1', 'dupe@test.com', 'hash1', 'key1')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, license_key) VALUES ('u2', 'dupe@test.com', 'hash2', 'key2')
      `).run();
    }).toThrow();
  });

  it('enforces unique license_key constraint', () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, license_key) VALUES ('u3', 'a@test.com', 'hash', 'samekey')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, license_key) VALUES ('u4', 'b@test.com', 'hash', 'samekey')
      `).run();
    }).toThrow();
  });

  it('enforces unique user+profile in user_profiles', () => {
    const db = getDb();
    db.prepare(`INSERT INTO users (id, email, password_hash, license_key) VALUES ('u5', 'up@test.com', 'hash', 'upkey')`).run();
    db.prepare(`INSERT INTO profiles (id, creator_id, name, site_name, site_base_url, auth_type, checksum) VALUES ('p5', 'u5', 'P', 'S', 'https://s.com', 'cookie', 'abc')`).run();
    db.prepare(`INSERT INTO user_profiles (id, user_id, profile_id, installed_version) VALUES ('up1', 'u5', 'p5', 1)`).run();

    expect(() => {
      db.prepare(`INSERT INTO user_profiles (id, user_id, profile_id, installed_version) VALUES ('up2', 'u5', 'p5', 1)`).run();
    }).toThrow();
  });

  it('enforces review rating range', () => {
    const db = getDb();
    db.prepare(`INSERT INTO users (id, email, password_hash, license_key) VALUES ('u6', 'rev@test.com', 'hash', 'revkey')`).run();
    db.prepare(`INSERT INTO profiles (id, creator_id, name, site_name, site_base_url, auth_type, checksum) VALUES ('p6', 'u6', 'P', 'S', 'https://s.com', 'cookie', 'abc')`).run();

    expect(() => {
      db.prepare(`INSERT INTO reviews (id, profile_id, user_id, rating) VALUES ('r1', 'p6', 'u6', 0)`).run();
    }).toThrow();

    expect(() => {
      db.prepare(`INSERT INTO reviews (id, profile_id, user_id, rating) VALUES ('r2', 'p6', 'u6', 6)`).run();
    }).toThrow();

    // Valid rating should work
    db.prepare(`INSERT INTO reviews (id, profile_id, user_id, rating) VALUES ('r3', 'p6', 'u6', 5)`).run();
    const review = db.prepare(`SELECT rating FROM reviews WHERE id = 'r3'`).get() as any;
    expect(review.rating).toBe(5);
  });
});

describe('ID generation', () => {
  it('generates unique UUIDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('generates 64-char hex license keys', () => {
    const key = generateLicenseKey();
    expect(key.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
});
