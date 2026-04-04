import { describe, it, expect, afterAll } from 'vitest';
import { getDb, generateId, generateLicenseKey } from '@/lib/db';
import {
  listProfiles,
  getProfile,
  createProfileSubmission,
  loadProfilePackage,
  incrementDownloadCount,
} from '@/lib/profiles';
import { processApproval, processRejection } from '@/app/api/github/webhook/route';
import fs from 'fs';
import path from 'path';

// Use temp dir for packages in tests
const TEST_PACKAGES_DIR = path.join('/tmp', 'purroxy-test-packages-' + Date.now());
process.env.PURROXY_PACKAGES_DIR = TEST_PACKAGES_DIR;

function createTestUser(): string {
  const db = getDb();
  const id = generateId();
  db.prepare('INSERT INTO users (id, email, password_hash, license_key) VALUES (?, ?, ?, ?)').run(
    id, `user-${id}@test.com`, 'hash', generateLicenseKey()
  );
  return id;
}

function getSubmission(submissionId: string): any {
  const db = getDb();
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId);
}

const validProfileJson = JSON.stringify({
  id: 'test-profile-1',
  version: 1,
  schemaVersion: 1,
  name: 'Porkbun DNS',
  description: 'Manage DNS records on Porkbun',
  siteName: 'Porkbun',
  siteBaseUrl: 'https://porkbun.com',
  category: 'DNS',
  tags: ['dns', 'domains'],
  authType: 'session_cookie',
  endpointCount: 3,
  checksum: 'abc123',
});

const validAuthSpecJson = JSON.stringify({
  siteName: 'Porkbun',
  siteBaseUrl: 'https://porkbun.com',
  authType: 'session_cookie',
  loginEndpoint: {
    method: 'POST',
    url: 'https://porkbun.com/api/user/init',
    contentType: 'application/json',
    credentialFields: [
      { name: 'email', type: 'email', location: 'body' },
      { name: 'password', type: 'password', location: 'body' },
    ],
  },
  sessionMechanism: { type: 'cookie', cookieNames: ['session'] },
});

const validEndpointsJson = JSON.stringify([
  { id: 'ep-1', name: 'listDomains', description: 'List all domains', method: 'GET', urlPattern: 'https://porkbun.com/api/domains', headers: {}, parameters: [] },
  { id: 'ep-2', name: 'getDnsRecords', description: 'Get DNS records', method: 'GET', urlPattern: 'https://porkbun.com/api/dns/{domain}', headers: {}, parameters: [{ name: 'domain', location: 'path', type: 'string', required: true, description: 'Domain name', exampleValue: 'example.com' }] },
  { id: 'ep-3', name: 'createDnsRecord', description: 'Create a DNS record', method: 'POST', urlPattern: 'https://porkbun.com/api/dns/{domain}', headers: {}, parameters: [] },
]);

afterAll(() => {
  // Clean up test packages
  if (fs.existsSync(TEST_PACKAGES_DIR)) {
    fs.rmSync(TEST_PACKAGES_DIR, { recursive: true });
  }
});

describe('profile submission', () => {
  it('creates a profile and submission from valid data', () => {
    const userId = createTestUser();
    const result = createProfileSubmission(userId, validProfileJson, validAuthSpecJson, validEndpointsJson);

    expect(result.profileId).toBe('test-profile-1');
    expect(result.submissionId).toBeDefined();
    expect(result.validationResult.valid).toBe(true);
    expect(result.validationResult.errors).toHaveLength(0);

    const profile = getProfile(result.profileId);
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Porkbun DNS');
    expect(profile!.status).toBe('pending');
    expect(profile!.creator_id).toBe(userId);
  });

  it('rejects submission with secrets in data', () => {
    const userId = createTestUser();
    const badProfile = JSON.stringify({
      ...JSON.parse(validProfileJson),
      id: 'bad-profile-1',
      extra: 'sk-ant-verylongsecretkeyvaluethatshouldbecaught123',
    });

    const result = createProfileSubmission(userId, badProfile, validAuthSpecJson, validEndpointsJson);
    expect(result.validationResult.valid).toBe(false);
    expect(result.validationResult.errors.some(e => e.includes('API key'))).toBe(true);

    const profile = getProfile(result.profileId);
    expect(profile!.status).toBe('rejected');
  });

  it('stores package files on disk', () => {
    const userId = createTestUser();
    const result = createProfileSubmission(userId, validProfileJson, validAuthSpecJson, validEndpointsJson);

    const pkg = loadProfilePackage(result.profileId, 1);
    expect(pkg).not.toBeNull();
    expect(JSON.parse(pkg!.profileJson).name).toBe('Porkbun DNS');
    expect(JSON.parse(pkg!.endpointsJson)).toHaveLength(3);
  });
});

describe('profile listing', () => {
  it('lists only approved profiles by default', async () => {
    const userId = createTestUser();

    // Create and approve one profile via processApproval
    const r1 = createProfileSubmission(userId, validProfileJson, validAuthSpecJson, validEndpointsJson);
    const sub1 = getSubmission(r1.submissionId);
    await processApproval(sub1);

    // Create another that stays pending
    const pendingProfile = JSON.stringify({ ...JSON.parse(validProfileJson), id: 'pending-1', name: 'Pending Profile' });
    createProfileSubmission(userId, pendingProfile, validAuthSpecJson, validEndpointsJson);

    const { profiles, total } = listProfiles();
    expect(total).toBeGreaterThanOrEqual(1);
    expect(profiles.some(p => p.name === 'Porkbun DNS')).toBe(true);
    expect(profiles.some(p => p.name === 'Pending Profile')).toBe(false);
  });

  it('supports search by name', async () => {
    const userId = createTestUser();
    const r1 = createProfileSubmission(userId, validProfileJson, validAuthSpecJson, validEndpointsJson);
    const sub1 = getSubmission(r1.submissionId);
    await processApproval(sub1);

    const p2 = JSON.stringify({ ...JSON.parse(validProfileJson), id: 'p2', name: 'Stripe Billing' });
    const r2 = createProfileSubmission(userId, p2, validAuthSpecJson, validEndpointsJson);
    const sub2 = getSubmission(r2.submissionId);
    await processApproval(sub2);

    const { profiles } = listProfiles({ search: 'Stripe' });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Stripe Billing');
  });

  it('supports filtering by category', async () => {
    const userId = createTestUser();
    const r1 = createProfileSubmission(userId, validProfileJson, validAuthSpecJson, validEndpointsJson);
    const sub1 = getSubmission(r1.submissionId);
    await processApproval(sub1);

    const { profiles } = listProfiles({ category: 'DNS' });
    expect(profiles.length).toBeGreaterThanOrEqual(1);

    const { profiles: empty } = listProfiles({ category: 'CRM' });
    expect(empty).toHaveLength(0);
  });

  it('supports pagination', async () => {
    const userId = createTestUser();
    for (let i = 0; i < 5; i++) {
      const p = JSON.stringify({ ...JSON.parse(validProfileJson), id: `page-${i}`, name: `Profile ${i}` });
      const r = createProfileSubmission(userId, p, validAuthSpecJson, validEndpointsJson);
      const sub = getSubmission(r.submissionId);
      await processApproval(sub);
    }

    const page1 = listProfiles({ limit: 2, offset: 0 });
    expect(page1.profiles).toHaveLength(2);
    expect(page1.total).toBeGreaterThanOrEqual(5);

    const page2 = listProfiles({ limit: 2, offset: 2 });
    expect(page2.profiles).toHaveLength(2);
  });
});

describe('submission review via GitHub PR', () => {
  it('approves a submission and publishes the profile', async () => {
    const userId = createTestUser();
    const result = createProfileSubmission(userId, validProfileJson, validAuthSpecJson, validEndpointsJson);

    const sub = getSubmission(result.submissionId);
    await processApproval(sub);

    const profile = getProfile(result.profileId);
    expect(profile!.status).toBe('approved');
    expect(profile!.published_at).not.toBeNull();

    const updatedSub = getSubmission(result.submissionId);
    expect(updatedSub.status).toBe('approved');
  });

  it('rejects a submission with a reason', async () => {
    const userId = createTestUser();
    const p = JSON.stringify({ ...JSON.parse(validProfileJson), id: 'rej-1' });
    const result = createProfileSubmission(userId, p, validAuthSpecJson, validEndpointsJson);

    const sub = getSubmission(result.submissionId);
    await processRejection(sub, 'Endpoints do not work');

    const updatedSub = getSubmission(result.submissionId);
    expect(updatedSub.status).toBe('rejected');
    expect(updatedSub.rejection_reason).toBe('Endpoints do not work');
  });
});

describe('download count', () => {
  it('increments download count', () => {
    const userId = createTestUser();
    const result = createProfileSubmission(userId, validProfileJson, validAuthSpecJson, validEndpointsJson);

    incrementDownloadCount(result.profileId);
    incrementDownloadCount(result.profileId);
    incrementDownloadCount(result.profileId);

    const profile = getProfile(result.profileId);
    expect(profile!.download_count).toBe(3);
  });
});
