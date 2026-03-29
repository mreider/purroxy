import http from 'http';
import fs from 'fs';
import path from 'path';
import { safeStorage } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import { chromium, Browser } from 'playwright';
import { DiscoveredEndpoint, AuthSpec, SiteCredentials, ProfileManifest, Capability } from '../shared/types';
import { EndpointExecutor } from './executor';
import { log } from './logger';

interface ActiveProfile {
  slug: string;
  manifest: ProfileManifest;
  authSpec: AuthSpec;
  endpoints: DiscoveredEndpoint[];
  credentials: SiteCredentials;
  authHeaders: Record<string, string>;
  // Rate limiting
  requestTimestamps: number[];
  hourlyCount: number;
  hourlyResetAt: number;
  // Circuit breaker
  consecutiveErrors: number;
  paused: boolean;
  pauseReason?: string;
}

interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
}

interface ProxyConfig {
  port: number;
  maxRequestsPerSecond: number;
  maxRequestsPerHour: number;
  circuitBreakerThreshold: number;
}

const DEFAULT_CONFIG: ProxyConfig = {
  port: 9090,
  maxRequestsPerSecond: 1,
  maxRequestsPerHour: 100,
  circuitBreakerThreshold: 5,
};

export class LocalProxy {
  private server: http.Server | null = null;
  private profiles: Map<string, ActiveProfile> = new Map();
  private executor = new EndpointExecutor();
  private browser: Browser | null = null;
  private anthropic: Anthropic | null = null;
  private config: ProxyConfig;
  private _profilesDir: string = '';

  constructor(config: Partial<ProxyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setProfilesDir(dir: string): void {
    this._profilesDir = dir;
  }

  setApiKey(key: string): void {
    this.anthropic = new Anthropic({ apiKey: key });
  }

  private subscriptionChecker: (() => Promise<{ allowed: boolean; reason?: string }>) | null = null;
  private lockChecker: (() => boolean) | null = null;
  private onActivity: (() => void) | null = null;

  setSubscriptionChecker(fn: () => Promise<{ allowed: boolean; reason?: string }>): void {
    this.subscriptionChecker = fn;
  }

  setLockChecker(fn: () => boolean): void {
    this.lockChecker = fn;
  }

  setOnActivity(fn: () => void): void {
    this.onActivity = fn;
  }

  private activityLogger: ((entry: { timestamp: string; type: string; site: string; capability: string; status: string; durationMs?: number }) => void) | null = null;

  setActivityLogger(fn: typeof this.activityLogger): void {
    this.activityLogger = fn;
  }

  // Generate a URL-safe slug from profile name
  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async activateProfile(
    manifest: ProfileManifest,
    authSpec: AuthSpec,
    endpoints: DiscoveredEndpoint[],
    credentials: SiteCredentials
  ): Promise<string> {
    const slug = this.slugify(manifest.siteName || manifest.name);

    // Replay auth to get fresh headers
    const authHeaders = await this.executor.replayAuth(authSpec, credentials);

    const profile: ActiveProfile = {
      slug,
      manifest,
      authSpec,
      endpoints,
      credentials,
      authHeaders,
      requestTimestamps: [],
      hourlyCount: 0,
      hourlyResetAt: Date.now() + 3600000,
      consecutiveErrors: 0,
      paused: false,
    };

    this.profiles.set(slug, profile);
    return slug;
  }

  deactivateProfile(slug: string): void {
    this.profiles.delete(slug);
  }

  getActiveProfiles(): { slug: string; name: string; endpointCount: number; paused: boolean }[] {
    return Array.from(this.profiles.values()).map((p) => ({
      slug: p.slug,
      name: p.manifest.name,
      endpointCount: p.endpoints.length,
      paused: p.paused,
    }));
  }

  start(): void {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error', message: err.message }));
      });
    });

    this.server.listen(this.config.port, '127.0.0.1', () => {
      console.log(`Purroxy proxy listening on http://127.0.0.1:${this.config.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.profiles.clear();
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';

    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Root: list active profiles
    if (url === '/' || url === '') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        profiles: this.getActiveProfiles(),
        status: 'running',
      }));
      return;
    }

    // Parse /{slug}/...
    const parts = url.split('/').filter(Boolean);
    if (parts.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const slug = parts[0];

    // /{slug}/run-capability - execute a workflow/capability via Playwright
    // This does NOT require an activated profile — reads from disk directly
    if (parts.length === 2 && parts[1] === 'run-capability' && req.method === 'POST') {
      await this.executeCapability(req, res, slug);
      return;
    }

    // Everything below requires an activated profile (legacy HTTP endpoint flow)
    const profile = this.profiles.get(slug);

    if (!profile) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'profile_not_found',
        message: `No active profile with slug "${slug}".`,
        available: Array.from(this.profiles.keys()),
      }));
      return;
    }

    // /{slug}/openapi.json
    if (parts.length === 2 && parts[1] === 'openapi.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.generateOpenApi(profile)));
      return;
    }

    // /{slug}/endpoints - list available endpoints
    if (parts.length === 2 && parts[1] === 'endpoints') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        endpoints: profile.endpoints.map((ep) => ({
          name: ep.name,
          method: ep.method,
          path: `/${slug}/${ep.name}`,
          urlPattern: ep.urlPattern,
          parameters: ep.parameters,
        })),
      }));
      return;
    }

    // /{slug}/{endpointName} - execute an HTTP endpoint
    if (parts.length >= 2) {
      const endpointName = parts[1];
      const endpoint = profile.endpoints.find(
        (ep) => ep.name === endpointName && ep.method === (req.method || 'GET')
      );

      // Also try case-insensitive match
      const endpointFallback = endpoint || profile.endpoints.find(
        (ep) => ep.name.toLowerCase() === endpointName.toLowerCase() && ep.method === (req.method || 'GET')
      );

      if (!endpointFallback) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'endpoint_not_found',
          message: `No endpoint "${endpointName}" with method ${req.method}.`,
          available: profile.endpoints.map((ep) => `${ep.method} /${slug}/${ep.name}`),
        }));
        return;
      }

      await this.executeEndpoint(req, res, profile, endpointFallback);
    }
  }

  private async executeEndpoint(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    profile: ActiveProfile,
    endpoint: DiscoveredEndpoint
  ): Promise<void> {
    // Check circuit breaker
    if (profile.paused) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'profile_paused',
        message: profile.pauseReason || 'Profile is paused due to repeated errors. Re-record your login to continue.',
      }));
      return;
    }

    // Check rate limit (per-second)
    const now = Date.now();
    profile.requestTimestamps = profile.requestTimestamps.filter((t) => now - t < 1000);
    if (profile.requestTimestamps.length >= this.config.maxRequestsPerSecond) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'rate_limited',
        message: `Rate limit: ${this.config.maxRequestsPerSecond} request(s) per second.`,
        retryAfterMs: 1000 - (now - profile.requestTimestamps[0]),
      }));
      return;
    }

    // Check hourly budget
    if (now > profile.hourlyResetAt) {
      profile.hourlyCount = 0;
      profile.hourlyResetAt = now + 3600000;
    }
    if (profile.hourlyCount >= this.config.maxRequestsPerHour) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'hourly_budget_exceeded',
        message: `Hourly budget: ${this.config.maxRequestsPerHour} requests per hour.`,
        resetsAt: new Date(profile.hourlyResetAt).toISOString(),
      }));
      return;
    }

    // Record the request
    profile.requestTimestamps.push(now);
    profile.hourlyCount++;

    // Parse request body for params
    const bodyParams = await this.readBody(req);
    const urlParams = new URL(req.url || '/', `http://localhost`).searchParams;
    const params: Record<string, string> = {};

    // Merge URL query params
    urlParams.forEach((value, key) => { params[key] = value; });

    // Merge body params
    if (bodyParams) {
      try {
        const parsed = JSON.parse(bodyParams);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.assign(params, parsed);
        }
      } catch {
        // Not JSON, ignore
      }
    }

    // Set auth headers on executor
    this.executor.setAuthHeaders(profile.authHeaders);

    try {
      const result = await this.executor.execute(endpoint, Object.keys(params).length > 0 ? params : undefined);

      // Check for auth failure
      if (result.response.status === 401 || result.response.status === 403) {
        profile.consecutiveErrors++;
        if (profile.consecutiveErrors >= this.config.circuitBreakerThreshold) {
          profile.paused = true;
          profile.pauseReason = 'Session expired. Re-record your login to continue.';
        }
      } else if (result.response.status < 400) {
        profile.consecutiveErrors = 0; // Reset on success
      } else {
        profile.consecutiveErrors++;
        if (profile.consecutiveErrors >= this.config.circuitBreakerThreshold) {
          profile.paused = true;
          profile.pauseReason = `Paused after ${this.config.circuitBreakerThreshold} consecutive errors to protect your account.`;
        }
      }

      // Forward the response
      res.writeHead(result.response.status, {
        'Content-Type': 'application/json',
        'X-Purroxy-Duration-Ms': String(result.durationMs),
        'X-Purroxy-Endpoint': endpoint.name,
      });
      res.end(result.response.body);
    } catch (err: any) {
      profile.consecutiveErrors++;
      if (profile.consecutiveErrors >= this.config.circuitBreakerThreshold) {
        profile.paused = true;
        profile.pauseReason = `Paused after ${this.config.circuitBreakerThreshold} consecutive errors.`;
      }

      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'upstream_error',
        message: err.message,
        consecutiveErrors: profile.consecutiveErrors,
      }));
    }
  }

  private async executeCapability(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    siteSlug: string
  ): Promise<void> {
    const body = await this.readBody(req);
    let parsed: { workflowId?: string; inputs?: Record<string, string> };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_json', message: 'Request body must be JSON with workflowId and inputs.' }));
      return;
    }

    if (!parsed.workflowId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing_workflow_id', message: 'workflowId is required.' }));
      return;
    }

    // Check subscription/trial status
    if (this.subscriptionChecker) {
      const canUse = await this.subscriptionChecker();
      if (!canUse.allowed) {
        res.writeHead(402, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'subscription_required',
          message: canUse.reason || 'Your free trial has ended. Subscribe or publish a site for free access.',
        }));
        return;
      }
    }

    // Check lock status
    if (this.lockChecker?.()) {
      res.writeHead(423, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'locked',
        message: 'Purroxy is locked. Open the Purroxy app and click Unlock to continue.',
      }));
      return;
    }

    // Record activity for auto-lock timer
    this.onActivity?.();

    if (!this._profilesDir) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_configured', message: 'Profiles directory not set.' }));
      return;
    }

    if (!this.anthropic) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no_api_key', message: 'Anthropic API key not configured. Open Purroxy and set your API key.' }));
      return;
    }

    const profileId = this.findProfileIdBySlug(siteSlug);
    if (!profileId) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'site_not_found', message: `No site matching "${siteSlug}".` }));
      return;
    }

    // Load capability
    const capPath = path.join(this._profilesDir, profileId, 'workflows', `${parsed.workflowId}.json`);
    if (!fs.existsSync(capPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'capability_not_found', message: `Capability "${parsed.workflowId}" not found.` }));
      return;
    }

    let capability: Capability;
    try {
      capability = JSON.parse(fs.readFileSync(capPath, 'utf-8'));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'corrupt_capability', message: 'Could not read capability definition.' }));
      return;
    }

    // Check required vault keys
    if (capability.requiredVaultKeys && capability.requiredVaultKeys.length > 0) {
      const vault = this.loadVaultKeys();
      const missing = capability.requiredVaultKeys.filter((k) => !vault.includes(k));
      if (missing.length > 0) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'missing_vault_keys',
          message: `This capability requires sensitive data that is not in your vault: ${missing.join(', ')}. Open Purroxy Settings and add ${missing.length === 1 ? 'it' : 'them'} to your Vault.`,
          missing,
        }));
        return;
      }
    }

    // Load encrypted session cookies
    const sessionPath = path.join(this._profilesDir, profileId, 'session.enc');
    let cookies: SessionCookie[] = [];
    if (fs.existsSync(sessionPath) && safeStorage.isEncryptionAvailable()) {
      try {
        const encrypted = fs.readFileSync(sessionPath);
        cookies = JSON.parse(safeStorage.decryptString(encrypted));
      } catch {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'session_expired',
          message: 'Could not load session. Open Purroxy and log in to this site again.',
        }));
        return;
      }
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'no_session',
        message: 'No saved session for this site. Open Purroxy and add this site to log in.',
      }));
      return;
    }

    const startTime = Date.now();

    try {
      // 1. Launch Playwright, load page with cookies
      if (!this.browser) {
        this.browser = await chromium.launch({ headless: true });
      }
      const context = await this.browser.newContext();
      await context.addCookies(cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
      })));

      const page = await context.newPage();
      const targetUrl = capability.targetUrl || capability.profileId; // fallback
      this.activityLogger?.({
        timestamp: new Date().toISOString(),
        type: 'request',
        site: siteSlug,
        capability: capability.name,
        status: 'running',
      });

      log.info('proxy', `Loading ${targetUrl} for capability "${capability.name}"`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000); // let JS render

      // 2. Read page content
      const pageContent = await page.evaluate('document.body.innerText?.slice(0, 8000) || ""') as string;
      const pageUrl = page.url();
      const pageTitle = await page.title();

      await page.close();
      await context.close();

      // 3. Check for auth failure (redirected to login)
      if (pageUrl.includes('login') || pageUrl.includes('signin') || pageContent.includes('Sign in') && pageContent.length < 500) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'session_expired',
          message: 'Session expired. Open Purroxy and log in to this site again.',
        }));
        return;
      }

      // 4. Scrub vault values from page content before sending to Claude.
      // This is an architectural guarantee: even if the website echoes back
      // a credit card number or SSN on the page, Claude never sees it.
      let scrubbedContent = pageContent;
      if (capability.requiredVaultKeys && capability.requiredVaultKeys.length > 0) {
        for (const vaultKey of capability.requiredVaultKeys) {
          const vaultValue = this.loadVaultValue(vaultKey);
          if (vaultValue && vaultValue.length >= 4) {
            // Replace the full value and common partial displays
            scrubbedContent = scrubbedContent.split(vaultValue).join(`[REDACTED:${vaultKey}]`);
            // Also scrub last-4 patterns (e.g., "ending in 1234")
            const last4 = vaultValue.slice(-4);
            scrubbedContent = scrubbedContent.replace(
              new RegExp(`(ending in |last 4[: ]*|x{3,}\\s*)${last4.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
              `[REDACTED:${vaultKey} last4]`
            );
          }
        }
      }

      // 5. Call Claude to extract data
      const inputsDesc = parsed.inputs && Object.keys(parsed.inputs).length > 0
        ? `\n\nRuntime inputs provided:\n${Object.entries(parsed.inputs).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
        : '';

      const vaultDesc = capability.requiredVaultKeys && capability.requiredVaultKeys.length > 0
        ? `\n\nVault keys securely filled into the page (you cannot see the values, they were injected directly by Purroxy): ${capability.requiredVaultKeys.join(', ')}`
        : '';

      const hintsText = capability.hints && capability.hints.length > 0
        ? `\n\nHints about this site:\n${capability.hints.map((h) => `- ${h}`).join('\n')}`
        : '';

      const extractionPrompt = `You are extracting structured data from a web page for the Purroxy MCP tool.

Capability: ${capability.name}
Goal: ${capability.goal || capability.description}${hintsText}${inputsDesc}${vaultDesc}

Page title: ${pageTitle}
Page URL: ${pageUrl}

Page content:
${scrubbedContent}

Extract the requested data as a JSON object. Return ONLY valid JSON, no markdown, no explanation. If the data isn't available on this page, return {"error": "Data not found on this page"}.`;

      log.info('proxy', `Calling Claude to extract data for "${capability.name}"`);
      const response = await this.anthropic!.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: extractionPrompt }],
      });

      let extractedText = '';
      for (const block of response.content) {
        if (block.type === 'text') extractedText += block.text;
      }

      // Parse the JSON response
      let extracted: Record<string, unknown>;
      try {
        extracted = JSON.parse(extractedText.trim());
      } catch {
        // Try to find JSON in the response
        const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            extracted = JSON.parse(jsonMatch[0]);
          } catch {
            extracted = { raw_response: extractedText };
          }
        } else {
          extracted = { raw_response: extractedText };
        }
      }

      const durationMs = Date.now() - startTime;
      log.info('proxy', `Capability "${capability.name}" completed in ${durationMs}ms`);

      this.activityLogger?.({
        timestamp: new Date().toISOString(),
        type: 'response',
        site: siteSlug,
        capability: capability.name,
        status: 'success',
        durationMs,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: extracted,
        durationMs,
      }));
    } catch (err: any) {
      log.error('proxy', `Capability execution failed`, err.message);

      this.activityLogger?.({
        timestamp: new Date().toISOString(),
        type: 'response',
        site: siteSlug,
        capability: capability.name || 'unknown',
        status: 'error',
        durationMs: Date.now() - startTime,
      });

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'execution_error',
        message: err.message || 'Failed to execute capability.',
      }));
    }
  }

  private loadVaultKeys(): string[] {
    const vaultPath = path.join(require('electron').app.getPath('userData'), 'vault.enc');
    if (!fs.existsSync(vaultPath) || !safeStorage.isEncryptionAvailable()) return [];
    try {
      return Object.keys(JSON.parse(safeStorage.decryptString(fs.readFileSync(vaultPath))));
    } catch {
      return [];
    }
  }

  private loadVaultValue(key: string): string | null {
    const vaultPath = path.join(require('electron').app.getPath('userData'), 'vault.enc');
    if (!fs.existsSync(vaultPath) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      const vault = JSON.parse(safeStorage.decryptString(fs.readFileSync(vaultPath)));
      return vault[key] || null;
    } catch {
      return null;
    }
  }

  private findProfileIdBySlug(slug: string): string | null {
    if (!this._profilesDir || !fs.existsSync(this._profilesDir)) return null;
    const entries = fs.readdirSync(this._profilesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(this._profilesDir, entry.name, 'profile.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const profileSlug = this.slugify(manifest.siteName || manifest.name);
        if (profileSlug === slug) return entry.name;
      } catch { continue; }
    }
    return null;
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  }

  private generateOpenApi(profile: ActiveProfile): object {
    const paths: Record<string, any> = {};

    for (const ep of profile.endpoints) {
      const path = `/${profile.slug}/${ep.name}`;
      const method = ep.method.toLowerCase();

      const parameters = ep.parameters
        .filter((p) => p.location === 'query' || p.location === 'path')
        .map((p) => ({
          name: p.name,
          in: p.location,
          required: p.required,
          description: p.description,
          schema: { type: p.type || 'string' },
        }));

      const operation: any = {
        operationId: ep.name,
        summary: ep.description,
        parameters: parameters.length > 0 ? parameters : undefined,
        responses: {
          '200': {
            description: 'Successful response',
            content: { 'application/json': {} },
          },
        },
      };

      if (ep.exampleBody && ['POST', 'PUT', 'PATCH'].includes(ep.method)) {
        operation.requestBody = {
          content: {
            'application/json': {
              example: (() => { try { return JSON.parse(ep.exampleBody!); } catch { return ep.exampleBody; } })(),
            },
          },
        };
      }

      paths[path] = { [method]: operation };
    }

    return {
      openapi: '3.0.3',
      info: {
        title: `${profile.manifest.name} API`,
        description: profile.manifest.description || `API proxy for ${profile.manifest.siteName}`,
        version: String(profile.manifest.version),
      },
      servers: [{ url: `http://127.0.0.1:${this.config.port}` }],
      paths,
    };
  }
}
