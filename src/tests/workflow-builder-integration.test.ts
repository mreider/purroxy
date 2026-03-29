import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  saveWorkflow,
  loadWorkflow,
  listWorkflows,
} from '../main/workflow-storage';
import { createEmptyWorkflow, addStepToWorkflow, addInputToWorkflow } from '../main/workflow-builder';
import type { ProfileManifest, ProfileMeta } from '../shared/types';

// Test the full build flow: create profile + create workflow + save both

const TEST_DIR = path.join('/tmp', `purroxy-build-integ-${Date.now()}`);
const PROFILES_DIR = path.join(TEST_DIR, 'profiles');

beforeEach(() => {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

function createTestProfile(profileId: string): void {
  const profileDir = path.join(PROFILES_DIR, profileId);
  fs.mkdirSync(profileDir, { recursive: true });

  const manifest: ProfileManifest = {
    id: profileId,
    version: 1,
    schemaVersion: 1,
    name: 'Test Site',
    description: '',
    siteName: 'TestSite',
    siteBaseUrl: 'https://test.com',
    category: '',
    tags: [],
    authType: 'session_cookie',
    endpointCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    creatorName: 'You',
    checksum: '',
  };

  const meta: ProfileMeta = { source: 'local', usageCount: 0 };

  fs.writeFileSync(path.join(profileDir, 'profile.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(profileDir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(profileDir, 'auth-spec.json'), JSON.stringify({
    siteName: 'TestSite',
    siteBaseUrl: 'https://test.com',
    authType: 'session_cookie',
    loginEndpoint: { method: 'POST', url: 'https://test.com/login', contentType: 'application/json', credentialFields: [] },
    sessionMechanism: { type: 'cookie' },
  }, null, 2));
  fs.writeFileSync(path.join(profileDir, 'endpoints.json'), '[]');
}

describe('Build flow integration', () => {
  it('creates a profile, builds a workflow, saves both', () => {
    // 1. Create profile
    const profileId = 'build-test-profile';
    createTestProfile(profileId);

    // Verify profile exists
    expect(fs.existsSync(path.join(PROFILES_DIR, profileId, 'profile.json'))).toBe(true);

    // 2. Create workflow using builder functions
    let wf = createEmptyWorkflow(profileId, 'Search and Process');
    wf = addStepToWorkflow(wf, 'Navigate to search', 'action', [
      { type: 'navigate', url: 'https://test.com/search', description: 'Go to search' },
    ]);
    wf = addStepToWorkflow(wf, 'Type query', 'action', [
      { type: 'type', selector: '#search', value: '{query}', description: 'Enter search term' },
      { type: 'press', key: 'Enter', description: 'Submit' },
    ]);
    wf = addInputToWorkflow(wf, {
      name: 'query',
      type: 'string',
      description: 'Search term',
      required: true,
    });

    expect(wf.steps).toHaveLength(2);
    expect(wf.inputs).toHaveLength(1);

    // 3. Save workflow to the profile directory
    saveWorkflow(PROFILES_DIR, wf);

    // 4. Verify it's on disk
    const loaded = loadWorkflow(PROFILES_DIR, profileId, wf.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Search and Process');
    expect(loaded!.steps).toHaveLength(2);

    // 5. List workflows for this profile
    const all = listWorkflows(PROFILES_DIR, profileId);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(wf.id);
  });

  it('adds multiple workflows to the same profile', () => {
    const profileId = 'multi-wf-profile';
    createTestProfile(profileId);

    const wf1 = createEmptyWorkflow(profileId, 'Workflow A');
    const wf2 = createEmptyWorkflow(profileId, 'Workflow B');
    const wf3 = createEmptyWorkflow(profileId, 'Workflow C');

    saveWorkflow(PROFILES_DIR, wf1);
    saveWorkflow(PROFILES_DIR, wf2);
    saveWorkflow(PROFILES_DIR, wf3);

    const all = listWorkflows(PROFILES_DIR, profileId);
    expect(all).toHaveLength(3);
  });

  it('profile directory structure is correct', () => {
    const profileId = 'structure-test';
    createTestProfile(profileId);

    const wf = createEmptyWorkflow(profileId, 'Test');
    saveWorkflow(PROFILES_DIR, wf);

    // Verify directory structure:
    // profiles/
    //   {profileId}/
    //     profile.json
    //     meta.json
    //     auth-spec.json
    //     endpoints.json
    //     workflows/
    //       {workflowId}.json

    expect(fs.existsSync(path.join(PROFILES_DIR, profileId, 'profile.json'))).toBe(true);
    expect(fs.existsSync(path.join(PROFILES_DIR, profileId, 'meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(PROFILES_DIR, profileId, 'auth-spec.json'))).toBe(true);
    expect(fs.existsSync(path.join(PROFILES_DIR, profileId, 'endpoints.json'))).toBe(true);
    expect(fs.existsSync(path.join(PROFILES_DIR, profileId, 'workflows', `${wf.id}.json`))).toBe(true);
  });
});
