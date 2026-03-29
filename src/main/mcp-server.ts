/**
 * Purroxy Unified MCP Server
 *
 * ONE stdio process that Claude Desktop (or any MCP client) spawns.
 * Discovers ALL installed sites from the profiles directory and registers
 * every capability as a namespaced MCP tool: {site_slug}__{capability_name}.
 *
 * Usage: node mcp-server.js
 *        node mcp-server.js --profiles-dir <path>
 *
 * The profiles dir is auto-detected from the OS-standard Purroxy data dir,
 * or can be overridden with --profiles-dir or PURROXY_PROFILES_DIR env var.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { ProfileManifest, Capability } from '../shared/types';

const PROXY_PORT = 9090;

// --- Discover profiles directory ---

function findProfilesDir(): string {
  // 1. CLI arg
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profiles-dir' && args[i + 1]) return args[i + 1];
  }

  // 2. Env var
  if (process.env.PURROXY_PROFILES_DIR) return process.env.PURROXY_PROFILES_DIR;

  // 3. OS-standard location
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, 'Library', 'Application Support', 'purroxy', 'profiles'),  // macOS
    path.join(home, '.config', 'purroxy', 'profiles'),                         // Linux
    path.join(home, 'AppData', 'Roaming', 'purroxy', 'profiles'),              // Windows
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

// --- Load all sites and their capabilities ---

interface SiteInfo {
  slug: string;
  manifest: ProfileManifest;
  capabilities: Capability[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function loadAllSites(profilesDir: string): SiteInfo[] {
  if (!fs.existsSync(profilesDir)) return [];

  const sites: SiteInfo[] = [];
  const entries = fs.readdirSync(profilesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(profilesDir, entry.name);

    // Load manifest
    const manifestPath = path.join(dir, 'profile.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest: ProfileManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      continue;
    }

    // Load capabilities
    const wfDir = path.join(dir, 'workflows');
    const capabilities: Capability[] = [];
    if (fs.existsSync(wfDir)) {
      for (const f of fs.readdirSync(wfDir).filter((f) => f.endsWith('.json'))) {
        try {
          capabilities.push(JSON.parse(fs.readFileSync(path.join(wfDir, f), 'utf-8')));
        } catch {
          // skip corrupt
        }
      }
    }

    sites.push({
      slug: slugify(manifest.siteName || manifest.name),
      manifest,
      capabilities,
    });
  }

  return sites;
}

// --- Auto-launch Purroxy if proxy isn't running ---

import { execSync, spawn } from 'child_process';

let launchAttempted = false;

async function ensureProxyRunning(): Promise<void> {
  // Quick check: is the proxy up?
  try {
    await proxyRequest('GET', '/');
    return; // Already running
  } catch {
    // Not running — try to launch
  }

  if (launchAttempted) return; // Don't retry endlessly
  launchAttempted = true;

  try {
    if (process.platform === 'darwin') {
      // Try the installed app first, then the dev build
      try {
        execSync('open -a Purroxy', { stdio: 'ignore' });
      } catch {
        // App not installed — try opening from /Applications directly
        spawn('open', ['/Applications/Purroxy.app'], { detached: true, stdio: 'ignore' }).unref();
      }
    } else if (process.platform === 'win32') {
      const appPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Purroxy', 'Purroxy.exe');
      spawn(appPath, [], { detached: true, stdio: 'ignore' }).unref();
    } else {
      // Linux — try common locations
      spawn('purroxy', [], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Can't launch — will show error to user
    return;
  }

  // Wait up to 10 seconds for the proxy to come up
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      await proxyRequest('GET', '/');
      return; // It's up
    } catch {
      // Keep waiting
    }
  }
}

// --- HTTP proxy helper ---

function proxyRequest(
  method: string,
  proxyPath: string,
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PROXY_PORT,
      path: proxyPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// --- Tool name helpers ---

function makeToolName(siteSlug: string, capabilityName: string): string {
  const capSlug = capabilityName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${siteSlug}__${capSlug}`;
}

// --- Main ---

async function main() {
  const profilesDir = findProfilesDir();
  const sites = loadAllSites(profilesDir);

  const server = new McpServer({
    name: 'purroxy',
    version: '1.0.0',
  });

  let toolCount = 0;

  for (const site of sites) {
    for (const cap of site.capabilities) {
      const toolName = makeToolName(site.slug, cap.name);

      // Build input schema from capability inputs
      const zodShape: Record<string, z.ZodTypeAny> = {};
      for (const input of cap.inputs) {
        const base = input.type === 'number' ? z.number() : z.string();
        zodShape[input.name] = input.required
          ? base.describe(input.description || input.name)
          : base.optional().describe(input.description || input.name);
      }

      const description = `[${site.manifest.siteName}] ${cap.description || cap.name}`;

      server.tool(
        toolName,
        description,
        Object.keys(zodShape).length > 0 ? zodShape : {},
        async (params: Record<string, any>) => {
          try {
            // Ensure Purroxy app is running (auto-launch if needed)
            await ensureProxyRunning();

            // Call the proxy's capability execution route
            const proxyPath = `/${site.slug}/run-capability`;
            const result = await proxyRequest('POST', proxyPath, JSON.stringify({
              workflowId: cap.id,
              inputs: params,
            }));

            if (result.status === 402) {
              let msg: string;
              try {
                const err = JSON.parse(result.body);
                msg = err.message || 'Subscription required.';
              } catch {
                msg = 'Subscription required.';
              }
              return {
                content: [{
                  type: 'text' as const,
                  text: `${msg} Open the Purroxy desktop app to subscribe or publish a site for free access.`,
                }],
                isError: true,
              };
            }

            if (result.status === 422) {
              let msg: string;
              try {
                const err = JSON.parse(result.body);
                msg = err.message || 'Missing required vault data.';
              } catch {
                msg = 'Missing required vault data.';
              }
              return {
                content: [{
                  type: 'text' as const,
                  text: `${msg}`,
                }],
                isError: true,
              };
            }

            if (result.status === 423) {
              return {
                content: [{
                  type: 'text' as const,
                  text: `Purroxy is locked for security. Open the Purroxy desktop app and click Unlock to continue. This protects your saved login sessions when you step away from your computer.`,
                }],
                isError: true,
              };
            }

            if (result.status === 401) {
              // Session expired or missing
              let msg: string;
              try {
                const err = JSON.parse(result.body);
                msg = err.message || 'Session expired.';
              } catch {
                msg = 'Session expired.';
              }
              return {
                content: [{
                  type: 'text' as const,
                  text: `${msg}\n\nOpen the Purroxy desktop app, go to this site, and log in again. Your credentials are stored securely on your machine and are never shared with any AI.`,
                }],
                isError: true,
              };
            }

            if (result.status >= 400) {
              let errText: string;
              try {
                const err = JSON.parse(result.body);
                errText = err.message || result.body;
              } catch {
                errText = result.body;
              }
              return {
                content: [{ type: 'text' as const, text: `Error: ${errText}` }],
                isError: true,
              };
            }

            let parsed: any;
            try {
              parsed = JSON.parse(result.body);
            } catch {
              parsed = { raw: result.body };
            }

            const lines: string[] = [];
            if (parsed.data) {
              lines.push(JSON.stringify(parsed.data, null, 2));
            } else {
              lines.push(JSON.stringify(parsed, null, 2));
            }
            lines.push('');
            lines.push(`[Executed locally via Purroxy. Your credentials never left your machine.]`);

            return {
              content: [{ type: 'text' as const, text: lines.join('\n') }],
            };
          } catch (err: any) {
            if (err.code === 'ECONNREFUSED') {
              return {
                content: [{
                  type: 'text' as const,
                  text: `Could not connect to Purroxy. I tried to launch it automatically but it may not be installed. Please open the Purroxy desktop app manually.\n\nPurroxy runs locally on your machine. Your credentials and session data never leave your computer.`,
                }],
                isError: true,
              };
            }
            return {
              content: [{
                type: 'text' as const,
                text: `Purroxy error: ${err.message}. Make sure the Purroxy desktop app is running.`,
              }],
              isError: true,
            };
          }
        }
      );

      toolCount++;
    }
  }

  // Also register a meta tool to list available sites and capabilities
  server.tool(
    'purroxy_list_sites',
    'List all Purroxy sites and their capabilities. Call this first to see what is available.',
    {},
    async () => {
      // Re-read from disk each time so newly added sites show up
      const currentSites = loadAllSites(profilesDir);
      if (currentSites.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No sites configured in Purroxy yet. Open the Purroxy desktop app to add a site.',
          }],
        };
      }

      const lines: string[] = [];
      for (const s of currentSites) {
        lines.push(`## ${s.manifest.siteName} (${s.manifest.siteBaseUrl})`);
        if (s.capabilities.length === 0) {
          lines.push('  No capabilities yet.');
        } else {
          for (const c of s.capabilities) {
            const tool = makeToolName(s.slug, c.name);
            lines.push(`  - **${tool}**: ${c.description || c.name}`);
            if (c.inputs.length > 0) {
              lines.push(`    Inputs: ${c.inputs.map((i) => `${i.name}${i.required ? '*' : ''}`).join(', ')}`);
            }
          }
        }
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Purroxy MCP server failed to start:', err);
  process.exit(1);
});
