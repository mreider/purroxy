import { describe, it, expect } from 'vitest';
import { generateMcpConfig, generateClaudeDesktopConfig } from '../main/mcp-config';
import { ProfileManifest } from '../shared/types';

function makeManifest(overrides: Partial<ProfileManifest> = {}): ProfileManifest {
  return {
    id: 'test-id',
    version: 1,
    schemaVersion: 1,
    name: 'Acme Invoicing',
    description: 'Invoice management',
    siteName: 'Acme Corp',
    siteBaseUrl: 'https://acme.com',
    category: 'billing',
    tags: ['invoicing'],
    authType: 'session_cookie',
    endpointCount: 5,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    creatorName: 'You',
    checksum: 'abc',
    ...overrides,
  };
}

describe('generateMcpConfig', () => {
  it('creates a config with slugified server name', () => {
    const config = generateMcpConfig('/path/to/profile', makeManifest(), '/path/to/mcp-server.js');

    expect(config).toHaveProperty('purroxy-acme-corp');
    expect(config['purroxy-acme-corp'].command).toBe('node');
    expect(config['purroxy-acme-corp'].args).toEqual([
      '/path/to/mcp-server.js',
      '--profile-dir',
      '/path/to/profile',
    ]);
  });

  it('handles special characters in site name', () => {
    const config = generateMcpConfig(
      '/path',
      makeManifest({ siteName: 'My App (v2.0)!' }),
      '/mcp.js'
    );

    expect(config).toHaveProperty('purroxy-my-app-v2-0');
  });
});

describe('generateClaudeDesktopConfig', () => {
  it('generates config for multiple profiles', () => {
    const config = generateClaudeDesktopConfig(
      [
        { profileDir: '/profiles/a', manifest: makeManifest({ siteName: 'Alpha' }) },
        { profileDir: '/profiles/b', manifest: makeManifest({ siteName: 'Beta' }) },
      ],
      '/mcp.js'
    );

    expect(config.mcpServers).toHaveProperty('purroxy-alpha');
    expect(config.mcpServers).toHaveProperty('purroxy-beta');
    expect(Object.keys(config.mcpServers)).toHaveLength(2);
  });

  it('produces valid Claude Desktop config structure', () => {
    const config = generateClaudeDesktopConfig(
      [{ profileDir: '/p', manifest: makeManifest() }],
      '/mcp.js'
    );

    // Claude Desktop expects { mcpServers: { name: { command, args } } }
    expect(config).toHaveProperty('mcpServers');
    const server = config.mcpServers['purroxy-acme-corp'];
    expect(server.command).toBe('node');
    expect(Array.isArray(server.args)).toBe(true);
  });
});
