import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  createUser,
  getUserByEmail,
  getUserByLicenseKey,
  getUserById,
} from '@/lib/auth';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('mypassword123');
    expect(hash).not.toBe('mypassword123');
    expect(hash.length).toBeGreaterThan(20);

    const valid = await verifyPassword('mypassword123', hash);
    expect(valid).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correctpassword');
    const valid = await verifyPassword('wrongpassword', hash);
    expect(valid).toBe(false);
  });
});

describe('session tokens', () => {
  it('creates and verifies a valid token', () => {
    const token = createSessionToken('user-123', 'test@example.com');
    expect(token).toContain('.');

    const session = verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe('user-123');
    expect(session!.email).toBe('test@example.com');
    expect(session!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a tampered token', () => {
    const token = createSessionToken('user-123', 'test@example.com');
    const tampered = token.slice(0, -4) + 'xxxx';
    const session = verifySessionToken(tampered);
    expect(session).toBeNull();
  });

  it('rejects a completely invalid token', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('not-a-token')).toBeNull();
    expect(verifySessionToken('abc.def')).toBeNull();
  });
});

describe('user CRUD', () => {
  it('creates a user with a license key', async () => {
    const hash = await hashPassword('testpass');
    const user = createUser('user@test.com', hash, 'Test User');

    expect(user.id).toBeDefined();
    expect(user.email).toBe('user@test.com');
    expect(user.display_name).toBe('Test User');
    expect(user.license_key).toBeDefined();
    expect(user.license_key.length).toBe(64); // 32 bytes hex
    expect(user.subscription_status).toBe('none');
  });

  it('retrieves user by email', async () => {
    const hash = await hashPassword('testpass');
    createUser('find@test.com', hash);

    const found = getUserByEmail('find@test.com');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('find@test.com');
    expect(found!.password_hash).toBe(hash);
  });

  it('retrieves user by license key', async () => {
    const hash = await hashPassword('testpass');
    const user = createUser('license@test.com', hash);

    const found = getUserByLicenseKey(user.license_key);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
  });

  it('retrieves user by id', async () => {
    const hash = await hashPassword('testpass');
    const user = createUser('byid@test.com', hash);

    const found = getUserById(user.id);
    expect(found).not.toBeNull();
    expect(found!.email).toBe('byid@test.com');
  });

  it('returns null for nonexistent email', () => {
    expect(getUserByEmail('nobody@test.com')).toBeNull();
  });

  it('returns null for nonexistent license key', () => {
    expect(getUserByLicenseKey('fake-key-1234')).toBeNull();
  });

  it('rejects duplicate email', async () => {
    const hash = await hashPassword('testpass');
    createUser('dupe@test.com', hash);

    expect(() => createUser('dupe@test.com', hash)).toThrow();
  });
});
