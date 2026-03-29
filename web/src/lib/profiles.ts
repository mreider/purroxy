import { getDb, generateId } from './db';
import { validateProfilePackage } from './validation';
import path from 'path';
import fs from 'fs';

const PACKAGES_DIR = process.env.PURROXY_PACKAGES_DIR || path.join(process.cwd(), 'data', 'packages');

export interface ProfileRecord {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  site_name: string;
  site_base_url: string;
  category: string | null;
  tags: string | null;
  auth_type: string;
  endpoint_count: number;
  current_version: number;
  status: string;
  download_count: number;
  average_rating: number | null;
  package_path: string | null;
  checksum: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileListOptions {
  search?: string;
  category?: string;
  status?: string;
  creatorId?: string;
  limit?: number;
  offset?: number;
}

export function listProfiles(options: ProfileListOptions = {}): { profiles: ProfileRecord[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  } else {
    conditions.push("status = 'approved'");
  }

  if (options.search) {
    conditions.push('(name LIKE ? OR site_name LIKE ? OR description LIKE ?)');
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }

  if (options.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }

  if (options.creatorId) {
    conditions.push('creator_id = ?');
    params.push(options.creatorId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const total = (db.prepare(`SELECT COUNT(*) as count FROM profiles ${where}`).get(...params) as any).count;
  const profiles = db.prepare(
    `SELECT p.*, u.display_name as creator_name, u.email as creator_email
     FROM profiles p LEFT JOIN users u ON p.creator_id = u.id
     ${where} ORDER BY p.download_count DESC, p.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as (ProfileRecord & { creator_name: string | null; creator_email: string })[];

  return { profiles, total };
}

export function getProfile(profileId: string): (ProfileRecord & { creator_name: string | null }) | null {
  const db = getDb();
  return (db.prepare(
    `SELECT p.*, u.display_name as creator_name
     FROM profiles p LEFT JOIN users u ON p.creator_id = u.id
     WHERE p.id = ?`
  ).get(profileId) as any) || null;
}

export function saveProfilePackage(
  profileId: string,
  version: number,
  profileJson: string,
  authSpecJson: string,
  endpointsJson: string
): string {
  const dir = path.join(PACKAGES_DIR, profileId, `v${version}`);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'profile.json'), profileJson);
  fs.writeFileSync(path.join(dir, 'auth-spec.json'), authSpecJson);
  fs.writeFileSync(path.join(dir, 'endpoints.json'), endpointsJson);

  return dir;
}

export function loadProfilePackage(profileId: string, version: number): {
  profileJson: string;
  authSpecJson: string;
  endpointsJson: string;
} | null {
  const dir = path.join(PACKAGES_DIR, profileId, `v${version}`);
  if (!fs.existsSync(dir)) return null;

  try {
    return {
      profileJson: fs.readFileSync(path.join(dir, 'profile.json'), 'utf-8'),
      authSpecJson: fs.readFileSync(path.join(dir, 'auth-spec.json'), 'utf-8'),
      endpointsJson: fs.readFileSync(path.join(dir, 'endpoints.json'), 'utf-8'),
    };
  } catch {
    return null;
  }
}

export function createProfileSubmission(
  creatorId: string,
  profileJson: string,
  authSpecJson: string,
  endpointsJson: string
): { profileId: string; submissionId: string; validationResult: ReturnType<typeof validateProfilePackage> } {
  const db = getDb();
  const validation = validateProfilePackage(profileJson, authSpecJson, endpointsJson);

  const profile = JSON.parse(profileJson);
  const profileId = profile.id || generateId();
  const submissionId = generateId();
  const version = profile.version || 1;

  // Upsert profile record
  const existing = getProfile(profileId);
  if (existing) {
    db.prepare(`
      UPDATE profiles SET
        name = ?, description = ?, site_name = ?, site_base_url = ?,
        category = ?, tags = ?, auth_type = ?, endpoint_count = ?,
        current_version = ?, checksum = ?, status = 'pending', updated_at = datetime('now')
      WHERE id = ?
    `).run(
      profile.name, profile.description || null, profile.siteName, profile.siteBaseUrl,
      profile.category || null, JSON.stringify(profile.tags || []),
      profile.authType, profile.endpointCount || 0,
      version, profile.checksum || '', profileId
    );
  } else {
    db.prepare(`
      INSERT INTO profiles (id, creator_id, name, description, site_name, site_base_url, category, tags, auth_type, endpoint_count, current_version, checksum, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profileId, creatorId, profile.name, profile.description || null,
      profile.siteName, profile.siteBaseUrl,
      profile.category || null, JSON.stringify(profile.tags || []),
      profile.authType, profile.endpointCount || 0,
      version, profile.checksum || '',
      validation.valid ? 'pending' : 'rejected'
    );
  }

  // Save package to disk
  const packagePath = saveProfilePackage(profileId, version, profileJson, authSpecJson, endpointsJson);

  // Update package path
  db.prepare('UPDATE profiles SET package_path = ? WHERE id = ?').run(packagePath, profileId);

  // Create version record
  const versionId = generateId();
  db.prepare(`
    INSERT INTO profile_versions (id, profile_id, version, package_path, checksum)
    VALUES (?, ?, ?, ?, ?)
  `).run(versionId, profileId, version, packagePath, profile.checksum || '');

  // Create submission record
  db.prepare(`
    INSERT INTO submissions (id, profile_id, version, submitter_id, status, validation_result)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    submissionId, profileId, version, creatorId,
    validation.valid ? 'pending' : 'rejected',
    JSON.stringify(validation)
  );

  return { profileId, submissionId, validationResult: validation };
}

export function approveSubmission(submissionId: string, reviewerId: string): void {
  const db = getDb();
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) as any;
  if (!submission) throw new Error('Submission not found');

  db.prepare(`
    UPDATE submissions SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(reviewerId, submissionId);

  db.prepare(`
    UPDATE profiles SET status = 'approved', published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(submission.profile_id);
}

export function rejectSubmission(submissionId: string, reviewerId: string, reason: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE submissions SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(reason, reviewerId, submissionId);
}

export function incrementDownloadCount(profileId: string): void {
  const db = getDb();
  db.prepare('UPDATE profiles SET download_count = download_count + 1 WHERE id = ?').run(profileId);
}
