import { describe, it, expect } from 'vitest';
import { scanForSecrets, scanForCode, validateProfilePackage } from '@/lib/validation';

describe('secret scanning', () => {
  it('detects API keys', () => {
    const findings = scanForSecrets('{"key": "sk-ant-abc123def456ghi789jkl012mno"}');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toContain('API key');
  });

  it('detects Bearer tokens', () => {
    const findings = scanForSecrets('{"auth": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.something"}');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('detects JWT tokens', () => {
    const findings = scanForSecrets('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.');
    expect(findings.some(f => f.includes('JWT'))).toBe(true);
  });

  it('detects long base64 strings', () => {
    const longBase64 = 'A'.repeat(80);
    const findings = scanForSecrets(longBase64);
    expect(findings.some(f => f.includes('base64'))).toBe(true);
  });

  it('detects password in values', () => {
    const findings = scanForSecrets('password: "mysecretpass123"');
    expect(findings.some(f => f.includes('Password'))).toBe(true);
  });

  it('passes clean data', () => {
    const findings = scanForSecrets('{"name": "listUsers", "method": "GET", "url": "https://api.example.com/users"}');
    expect(findings).toHaveLength(0);
  });
});

describe('code scanning', () => {
  it('detects JavaScript functions', () => {
    const findings = scanForCode('function() { alert("hi") }');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('detects arrow functions', () => {
    const findings = scanForCode('() => { doEvil() }');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('detects eval', () => {
    const findings = scanForCode('eval("malicious code")');
    expect(findings.some(f => f.includes('eval'))).toBe(true);
  });

  it('detects script tags', () => {
    const findings = scanForCode('<script>alert("xss")</script>');
    expect(findings.some(f => f.includes('Script'))).toBe(true);
  });

  it('detects require', () => {
    const findings = scanForCode('const fs = require("fs")');
    expect(findings.some(f => f.includes('require'))).toBe(true);
  });

  it('passes clean endpoint data', () => {
    const findings = scanForCode('{"method": "POST", "urlPattern": "https://api.example.com/users", "name": "createUser"}');
    expect(findings).toHaveLength(0);
  });
});

describe('profile package validation', () => {
  const validProfile = JSON.stringify({
    id: 'test-uuid',
    version: 1,
    schemaVersion: 1,
    name: 'Test Profile',
    siteName: 'Example',
    siteBaseUrl: 'https://example.com',
    authType: 'session_cookie',
    endpointCount: 1,
    checksum: 'abc123',
  });

  const validAuthSpec = JSON.stringify({
    siteName: 'Example',
    siteBaseUrl: 'https://example.com',
    authType: 'session_cookie',
    loginEndpoint: {
      method: 'POST',
      url: 'https://example.com/login',
      contentType: 'application/json',
      credentialFields: [
        { name: 'email', type: 'email', location: 'body' },
        { name: 'password', type: 'password', location: 'body' },
      ],
    },
    sessionMechanism: { type: 'cookie', cookieNames: ['session'] },
  });

  const validEndpoints = JSON.stringify([
    {
      id: 'ep-1',
      name: 'listUsers',
      description: 'List all users',
      method: 'GET',
      urlPattern: 'https://example.com/api/users',
      headers: {},
      parameters: [],
    },
  ]);

  it('accepts a valid profile package', () => {
    const result = validateProfilePackage(validProfile, validAuthSpec, validEndpoints);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid JSON', () => {
    const result = validateProfilePackage('not json', validAuthSpec, validEndpoints);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not valid JSON'))).toBe(true);
  });

  it('rejects missing profile fields', () => {
    const result = validateProfilePackage('{}', validAuthSpec, validEndpoints);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing id'))).toBe(true);
    expect(result.errors.some(e => e.includes('missing name'))).toBe(true);
  });

  it('rejects missing auth spec fields', () => {
    const result = validateProfilePackage(validProfile, '{}', validEndpoints);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing loginEndpoint'))).toBe(true);
  });

  it('rejects endpoints that are not an array', () => {
    const result = validateProfilePackage(validProfile, validAuthSpec, '{"not": "array"}');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must be an array'))).toBe(true);
  });

  it('rejects endpoints with missing fields', () => {
    const result = validateProfilePackage(validProfile, validAuthSpec, JSON.stringify([{}]));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing name'))).toBe(true);
    expect(result.errors.some(e => e.includes('missing method'))).toBe(true);
  });

  it('rejects profiles containing secrets', () => {
    const profileWithSecret = JSON.stringify({
      ...JSON.parse(validProfile),
      extra: 'sk-ant-verylongsecretkeyvaluehere1234567890',
    });
    const result = validateProfilePackage(profileWithSecret, validAuthSpec, validEndpoints);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('API key'))).toBe(true);
  });

  it('rejects profiles containing executable code', () => {
    const endpointsWithCode = JSON.stringify([
      {
        id: 'ep-1',
        name: 'evil',
        description: 'function() { alert("xss") }',
        method: 'GET',
        urlPattern: 'https://example.com/api/users',
        headers: {},
        parameters: [],
      },
    ]);
    const result = validateProfilePackage(validProfile, validAuthSpec, endpointsWithCode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Executable code'))).toBe(true);
  });

  it('rejects auth spec with invalid login URL', () => {
    const badAuthSpec = JSON.stringify({
      ...JSON.parse(validAuthSpec),
      loginEndpoint: {
        ...JSON.parse(validAuthSpec).loginEndpoint,
        url: 'not-a-url',
      },
    });
    const result = validateProfilePackage(validProfile, badAuthSpec, validEndpoints);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not a valid URL'))).toBe(true);
  });
});
