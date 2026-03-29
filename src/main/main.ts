import { app, BrowserWindow, ipcMain, safeStorage, session, shell, webContents } from 'electron';
import path from 'path';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { TrafficCapture, filterApiTraffic, isNoiseTraffic } from './capture';
import { ClaudeAnalyzer } from './claude';
import { EndpointExecutor } from './executor';
import { LocalProxy } from './proxy';
import { generateMcpConfig } from './mcp-config';
import { saveWorkflow, loadWorkflow, listWorkflows, deleteWorkflow } from './workflow-storage';
import { AgentDriver } from './agent-driver';
import { IPC, CapturedExchange, DiscoveredEndpoint, AuthSpec, SiteCredentials, ProfileManifest, ProfileMeta, ProfileInfo } from '../shared/types';
import { log } from './logger';

let mainWindow: BrowserWindow | null = null;

const capture = new TrafficCapture();
const claude = new ClaudeAnalyzer();
const executor = new EndpointExecutor();
const proxy = new LocalProxy();

let apiKey: string | null = null;

// Encrypted API key persistence
const KEY_FILE = 'api-key.enc';

function getKeyPath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

function saveEncryptedKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(getKeyPath(), encrypted);
}

function loadEncryptedKey(): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const keyPath = getKeyPath();
  if (!fs.existsSync(keyPath)) return null;
  try {
    const encrypted = fs.readFileSync(keyPath);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

function deleteEncryptedKey(): void {
  const keyPath = getKeyPath();
  if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
}

// License key persistence (same safeStorage pattern)
let licenseKey: string | null = null;
const LICENSE_FILE = 'license-key.enc';

function saveLicenseKey(key: string): void {
  licenseKey = key;
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(path.join(app.getPath('userData'), LICENSE_FILE), encrypted);
}

function loadLicenseKey(): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const keyPath = path.join(app.getPath('userData'), LICENSE_FILE);
  if (!fs.existsSync(keyPath)) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(keyPath));
  } catch {
    return null;
  }
}

// Persistent machine license (survives uninstall)
// Stored outside the app data directory so reinstalling doesn't reset the trial.
function getPersistentLicensePath(): string {
  const home = app.getPath('home');
  return path.join(home, '.purroxy-machine-id');
}

function ensureMachineLicense(): string {
  const persistPath = getPersistentLicensePath();

  // Check persistent file first
  if (fs.existsSync(persistPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(persistPath, 'utf-8'));
      if (data.machineId && data.firstSeen) {
        return data.machineId;
      }
    } catch { /* corrupt, regenerate */ }
  }

  // Generate new machine ID
  const { randomUUID } = require('crypto');
  const machineId = randomUUID();
  const data = {
    machineId,
    firstSeen: new Date().toISOString(),
    v: 1,
  };
  fs.writeFileSync(persistPath, JSON.stringify(data));
  return machineId;
}

function getMachineFirstSeen(): string | null {
  const persistPath = getPersistentLicensePath();
  if (!fs.existsSync(persistPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(persistPath, 'utf-8'));
    return data.firstSeen || null;
  } catch {
    return null;
  }
}

// App settings (JSON file in userData)
interface AppSettings {
  autoLockEnabled: boolean;
  autoLockMinutes: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoLockEnabled: false,
  autoLockMinutes: 5,
};

// PIN storage (encrypted)
const PIN_FILE = 'lock-pin.enc';

function saveLockPin(pin: string): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(pin);
  fs.writeFileSync(path.join(app.getPath('userData'), PIN_FILE), encrypted);
}

function loadLockPin(): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const pinPath = path.join(app.getPath('userData'), PIN_FILE);
  if (!fs.existsSync(pinPath)) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(pinPath));
  } catch {
    return null;
  }
}

function clearLockPin(): void {
  const pinPath = path.join(app.getPath('userData'), PIN_FILE);
  if (fs.existsSync(pinPath)) fs.unlinkSync(pinPath);
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

let appSettings = DEFAULT_SETTINGS;

// Lock state
let isLocked = false;
let lastActivityTime = Date.now();

function checkAutoLock(): void {
  if (!appSettings.autoLockEnabled || isLocked) return;
  const elapsed = (Date.now() - lastActivityTime) / 1000 / 60;
  if (elapsed >= appSettings.autoLockMinutes) {
    isLocked = true;
    mainWindow?.webContents.send('app:locked');
  }
}

function recordActivity(): void {
  lastActivityTime = Date.now();
}

// Vault (encrypted key-value store for sensitive data)
const VAULT_FILE = 'vault.enc';

function loadVault(): Record<string, string> {
  if (!safeStorage.isEncryptionAvailable()) return {};
  const vaultPath = path.join(app.getPath('userData'), VAULT_FILE);
  if (!fs.existsSync(vaultPath)) return {};
  try {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(vaultPath)));
  } catch {
    return {};
  }
}

function saveVault(vault: Record<string, string>): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(JSON.stringify(vault));
  fs.writeFileSync(path.join(app.getPath('userData'), VAULT_FILE), encrypted);
}

// Server base URL
const SERVER_URL = process.env.PURROXY_SERVER_URL || 'https://purroxy.com';

async function installProfileFromServer(profileId: string): Promise<boolean> {
  if (!licenseKey) throw new Error('License key required.');

  const res = await fetch(`${SERVER_URL}/api/profiles/${profileId}/download`, {
    headers: { 'Authorization': `Bearer ${licenseKey}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' })) as { error?: string };
    throw new Error(err.error || `Download failed (${res.status})`);
  }

  const data = await res.json() as { files: Record<string, unknown> };
  const dir = getProfilePath(profileId);
  writeJson(path.join(dir, 'profile.json'), data.files['profile.json']);
  writeJson(path.join(dir, 'auth-spec.json'), data.files['auth-spec.json']);
  writeJson(path.join(dir, 'endpoints.json'), data.files['endpoints.json']);
  writeJson(path.join(dir, 'meta.json'), {
    source: 'library',
    downloadedAt: new Date().toISOString(),
    usageCount: 0,
  });

  return true;
}

// Profile storage: userData/profiles/{uuid}/
function profilesDir(): string {
  const dir = path.join(app.getPath('userData'), 'profiles');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getProfilePath(profileId: string): string {
  const dir = path.join(profilesDir(), profileId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function saveProfileToDisk(
  profileId: string,
  manifest: ProfileManifest,
  authSpec: AuthSpec,
  endpoints: DiscoveredEndpoint[]
): void {
  const dir = getProfilePath(profileId);
  writeJson(path.join(dir, 'profile.json'), manifest);
  writeJson(path.join(dir, 'auth-spec.json'), authSpec);
  writeJson(path.join(dir, 'endpoints.json'), endpoints);
  // Create meta.json if it doesn't exist
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    const meta: ProfileMeta = { source: 'local', usageCount: 0 };
    writeJson(metaPath, meta);
  }
}

function loadProfileFromDisk(profileId: string): {
  manifest: ProfileManifest;
  authSpec: AuthSpec;
  endpoints: DiscoveredEndpoint[];
} | null {
  const dir = path.join(profilesDir(), profileId);
  const manifest = readJson<ProfileManifest>(path.join(dir, 'profile.json'));
  const authSpec = readJson<AuthSpec>(path.join(dir, 'auth-spec.json'));
  const endpoints = readJson<DiscoveredEndpoint[]>(path.join(dir, 'endpoints.json'));
  if (!manifest || !authSpec) return null;
  return { manifest, authSpec, endpoints: endpoints || [] };
}

function listAllProfiles(): ProfileInfo[] {
  const dir = profilesDir();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const profiles: ProfileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const profileDir = path.join(dir, entry.name);
    const manifest = readJson<ProfileManifest>(path.join(profileDir, 'profile.json'));
    if (!manifest) continue;
    const meta = readJson<ProfileMeta>(path.join(profileDir, 'meta.json')) || { source: 'local' as const, usageCount: 0 };
    const hasCredentials = fs.existsSync(path.join(profileDir, 'credentials.enc'));
    const hasEndpoints = fs.existsSync(path.join(profileDir, 'endpoints.json'));
    profiles.push({ manifest, meta, hasCredentials, hasEndpoints });
  }
  return profiles.sort((a, b) => b.manifest.updatedAt.localeCompare(a.manifest.updatedAt));
}

function deleteProfileFromDisk(profileId: string): void {
  const dir = path.join(profilesDir(), profileId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

function saveCredentials(profileId: string, creds: SiteCredentials): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(JSON.stringify(creds));
  fs.writeFileSync(path.join(getProfilePath(profileId), 'credentials.enc'), encrypted);
}

function loadCredentials(profileId: string): SiteCredentials | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const credPath = path.join(profilesDir(), profileId, 'credentials.enc');
  if (!fs.existsSync(credPath)) return null;
  try {
    const encrypted = fs.readFileSync(credPath);
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch {
    return null;
  }
}

function clearCredentials(profileId: string): void {
  const credPath = path.join(profilesDir(), profileId, 'credentials.enc');
  if (fs.existsSync(credPath)) fs.unlinkSync(credPath);
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Purroxy',
    icon: path.join(__dirname, '../../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173/');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  // Only open DevTools in development
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// IPC: DevTools toggle
ipcMain.handle('devtools:toggle', () => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }
  return true;
});

// Helper: broadcast token usage to renderer
function broadcastTokenUsage(): void {
  const tokens = claude.getSessionTokens();
  mainWindow?.webContents.send(IPC.TOKEN_USAGE_UPDATE, tokens);
}

// IPC: Token usage
ipcMain.handle(IPC.GET_TOKEN_USAGE, () => {
  return claude.getSessionTokens();
});

// Stream captured exchanges to renderer in real-time, filtering out noise
capture.onExchange((exchange) => {
  if (!isNoiseTraffic(exchange)) {
    mainWindow?.webContents.send(IPC.CAPTURE_EXCHANGE, exchange);
  }
});

// IPC: Attach CDP capture to a webview's webContents
ipcMain.handle(IPC.ATTACH_CAPTURE, async (_event, webContentsId: number) => {
  const wc = webContents.fromId(webContentsId);
  if (!wc) {
    throw new Error('Could not find webContents with id ' + webContentsId);
  }
  await capture.start(wc);
  return true;
});

// IPC: Detach capture
ipcMain.handle(IPC.DETACH_CAPTURE, () => {
  try {
    capture.stop();
  } catch {
    // webContents may already be destroyed
  }
  return true;
});

// IPC: Analyze selected exchanges with Claude
ipcMain.handle(
  IPC.ANALYZE_WITH_CLAUDE,
  async (_event, exchanges: CapturedExchange[], message?: string) => {
    const apiTraffic = filterApiTraffic(exchanges);

    if (apiTraffic.length === 0) {
      return {
        message: 'No API traffic found in the selected requests. Try selecting requests that return JSON data.',
        endpoints: [],
        siteName: '',
        siteDescription: '',
      };
    }

    const result = await claude.analyzeTraffic(apiTraffic, message, (text) => {
      mainWindow?.webContents.send(IPC.CLAUDE_STREAM, text);
    });
    broadcastTokenUsage();

    // Extract auth headers for endpoint execution
    if (apiTraffic.length > 0) {
      const authHeaders: Record<string, string> = {};
      const firstReq = apiTraffic[0].request;
      for (const [key, value] of Object.entries(firstReq.headers)) {
        const lower = key.toLowerCase();
        if (lower === 'authorization' || lower === 'cookie' || lower.startsWith('x-')) {
          authHeaders[key] = value;
        }
      }
      executor.setAuthHeaders(authHeaders);
    }

    return result;
  }
);

// IPC: Execute endpoint
ipcMain.handle(
  IPC.EXECUTE_ENDPOINT,
  async (_event, endpoint: DiscoveredEndpoint, params?: Record<string, string>) => {
    return executor.execute(endpoint, params);
  }
);

// IPC: Validate API key by making a minimal API call
ipcMain.handle(IPC.VALIDATE_API_KEY, async (_event, key: string) => {
  const client = new Anthropic({ apiKey: key });
  await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'ping' }],
  });
  return true;
});

// IPC: API key
ipcMain.handle(IPC.SET_API_KEY, (_event, key: string) => {
  apiKey = key;
  claude.setApiKey(key);
  proxy.setApiKey(key);
  saveEncryptedKey(key);
  return true;
});

ipcMain.handle(IPC.GET_API_KEY, () => {
  return apiKey ? '****' + apiKey.slice(-4) : null;
});

ipcMain.handle(IPC.CLEAR_API_KEY, () => {
  apiKey = null;
  deleteEncryptedKey();
  return true;
});

// IPC: Recording session control
ipcMain.handle(IPC.START_RECORDING, () => {
  capture.startRecording();
  return true;
});

ipcMain.handle(IPC.STOP_RECORDING, () => {
  return capture.stopRecording();
});

// IPC: Auth analysis (returns result, does NOT save -- the renderer decides where to save)
ipcMain.handle(IPC.ANALYZE_AUTH, async (_event, exchanges: CapturedExchange[]) => {
  const result = await claude.analyzeAuthFlow(exchanges, (text) => {
    mainWindow?.webContents.send(IPC.CLAUDE_STREAM, text);
  });
  broadcastTokenUsage();
  return result;
});

// IPC: Action analysis (returns result, does NOT save -- the renderer decides where to save)
ipcMain.handle(
  IPC.ANALYZE_ACTION,
  async (_event, exchanges: CapturedExchange[], actionDescription: string, authSpec: AuthSpec) => {
    const apiTraffic = filterApiTraffic(exchanges);
    if (apiTraffic.length === 0) {
      return { message: 'No API traffic found during this action.', endpoints: [], actionDescription };
    }
    const result = await claude.analyzeAction(apiTraffic, actionDescription, authSpec, (text) => {
      mainWindow?.webContents.send(IPC.CLAUDE_STREAM, text);
    });
    broadcastTokenUsage();
    return result;
  }
);

// IPC: Profile CRUD
ipcMain.handle(IPC.LIST_PROFILES, () => {
  return listAllProfiles();
});

ipcMain.handle(IPC.LOAD_PROFILE, (_event, profileId: string) => {
  return loadProfileFromDisk(profileId);
});

ipcMain.handle(
  IPC.SAVE_PROFILE,
  (_event, profileId: string, manifest: ProfileManifest, authSpec: AuthSpec, endpoints: DiscoveredEndpoint[]) => {
    saveProfileToDisk(profileId, manifest, authSpec, endpoints);
    return true;
  }
);

ipcMain.handle(IPC.DELETE_PROFILE, async (_event, profileId: string) => {
  // Read the profile's site URL before deleting so we can clear cookies
  const profile = loadProfileFromDisk(profileId);
  deleteProfileFromDisk(profileId);

  // Clear session cookies for this site's domain
  if (profile?.manifest.siteBaseUrl) {
    try {
      const url = new URL(profile.manifest.siteBaseUrl);
      const webviewSession = session.fromPartition('persist:target');
      const cookies = await webviewSession.cookies.get({ domain: url.hostname });
      for (const cookie of cookies) {
        const cookieUrl = `http${cookie.secure ? 's' : ''}://${cookie.domain?.replace(/^\./, '')}${cookie.path || '/'}`;
        await webviewSession.cookies.remove(cookieUrl, cookie.name);
      }
      log.info('ipc', `Cleared ${cookies.length} cookies for ${url.hostname}`);
    } catch (err: any) {
      log.warn('ipc', `Failed to clear cookies on delete`, err.message);
    }
  }

  return true;
});

// IPC: Credentials (per-profile)
ipcMain.handle(IPC.SAVE_CREDENTIALS, (_event, profileId: string, creds: SiteCredentials) => {
  saveCredentials(profileId, creds);
  return true;
});

ipcMain.handle(IPC.GET_CREDENTIALS, (_event, profileId: string) => {
  return loadCredentials(profileId);
});

ipcMain.handle(IPC.CLEAR_CREDENTIALS, (_event, profileId: string) => {
  clearCredentials(profileId);
  return true;
});

// IPC: License key
ipcMain.handle(IPC.SET_LICENSE_KEY, (_event, key: string) => {
  saveLicenseKey(key);
  return true;
});

ipcMain.handle(IPC.GET_LICENSE_KEY, () => {
  return licenseKey ? '****' + licenseKey.slice(-8) : null;
});

ipcMain.handle(IPC.VALIDATE_LICENSE, async () => {
  if (!licenseKey) return { valid: false, error: 'No license key set.' };
  try {
    const res = await fetch(`${SERVER_URL}/api/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    });
    return await res.json();
  } catch (err: any) {
    return { valid: false, error: err.message || 'Server unreachable.' };
  }
});

// IPC: Library install
ipcMain.handle(IPC.INSTALL_PROFILE, async (_event, profileId: string) => {
  return installProfileFromServer(profileId);
});


// IPC: Workflows
ipcMain.handle(IPC.SAVE_WORKFLOW, (_event, workflow: any) => {
  saveWorkflow(profilesDir(), workflow);
  return true;
});

ipcMain.handle(IPC.LOAD_WORKFLOW, (_event, profileId: string, workflowId: string) => {
  return loadWorkflow(profilesDir(), profileId, workflowId);
});

ipcMain.handle(IPC.LIST_WORKFLOWS, (_event, profileId: string) => {
  return listWorkflows(profilesDir(), profileId);
});

ipcMain.handle(IPC.DELETE_WORKFLOW, (_event, profileId: string, workflowId: string) => {
  deleteWorkflow(profilesDir(), profileId, workflowId);
  return true;
});

// IPC: Usage tracking (server-side)
ipcMain.handle(IPC.CHECK_USAGE, async (_event, profileId: string) => {
  if (!licenseKey) return { allowed: true, executionCount: 0, limit: 5, requiresSubscription: false, noAccount: true };
  try {
    const res = await fetch(`${SERVER_URL}/api/usage/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, profileId }),
    });
    return await res.json();
  } catch {
    // Server unreachable = hard fail per PRD
    return { allowed: false, error: 'Server unreachable. Purroxy requires an internet connection.' };
  }
});

ipcMain.handle(IPC.INCREMENT_USAGE, async (_event, profileId: string) => {
  if (!licenseKey) return { executionCount: 0 };
  try {
    const res = await fetch(`${SERVER_URL}/api/usage/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, profileId }),
    });
    return await res.json();
  } catch {
    return { error: 'Server unreachable.' };
  }
});

// IPC: MCP export (unified — one Purroxy server for all sites)
ipcMain.handle(IPC.EXPORT_MCP_CONFIG, () => {
  const mcpServerScript = path.join(__dirname, 'mcp-server.js');
  const config = generateMcpConfig(profilesDir(), mcpServerScript);

  // Platform-specific Claude Desktop config path
  let configPath: string;
  if (process.platform === 'win32') {
    configPath = '%APPDATA%\\Claude\\claude_desktop_config.json';
  } else if (process.platform === 'linux') {
    configPath = '~/.config/Claude/claude_desktop_config.json';
  } else {
    configPath = '~/Library/Application Support/Claude/claude_desktop_config.json';
  }

  return {
    config,
    configPath,
    instructions: `Add this to your Claude Desktop config. You only need to do this once. Purroxy automatically discovers all your sites and capabilities.`,
  };
});

// Claude Desktop config file path (resolved, not display)
function claudeConfigFile(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
  } else if (process.platform === 'linux') {
    return path.join(app.getPath('home'), '.config', 'Claude', 'claude_desktop_config.json');
  }
  return path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
}

function readClaudeConfig(): any {
  const configFile = claudeConfigFile();
  if (!fs.existsSync(configFile)) return null;
  try { return JSON.parse(fs.readFileSync(configFile, 'utf-8')); } catch { return null; }
}

// IPC: Check if Purroxy is installed in Claude Desktop
ipcMain.handle('mcp:check', () => {
  const config = readClaudeConfig();
  return { installed: !!(config?.mcpServers?.purroxy) };
});

// IPC: Auto-install Purroxy into Claude Desktop config
ipcMain.handle('mcp:install', () => {
  const mcpServerScript = path.join(__dirname, 'mcp-server.js');
  const purroxyConfig = generateMcpConfig(profilesDir(), mcpServerScript);
  const configFile = claudeConfigFile();

  let existing: any = {};
  if (fs.existsSync(configFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch {
      fs.copyFileSync(configFile, configFile + '.bak');
      existing = {};
    }
  } else {
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
  }

  if (!existing.mcpServers) existing.mcpServers = {};
  Object.assign(existing.mcpServers, purroxyConfig);

  fs.writeFileSync(configFile, JSON.stringify(existing, null, 2));
  log.info('ipc', `Installed Purroxy into Claude Desktop config at ${configFile}`);
  return { installed: true };
});

// IPC: Remove Purroxy from Claude Desktop config
ipcMain.handle('mcp:uninstall', () => {
  const configFile = claudeConfigFile();
  const config = readClaudeConfig();
  if (!config?.mcpServers?.purroxy) return { uninstalled: true };

  delete config.mcpServers.purroxy;
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  log.info('ipc', `Removed Purroxy from Claude Desktop config`);
  return { uninstalled: true };
});

// IPC: Proxy
ipcMain.handle(IPC.PROXY_START, () => {
  proxy.start();
  return true;
});

ipcMain.handle(IPC.PROXY_STOP, () => {
  proxy.stop();
  return true;
});

ipcMain.handle(IPC.PROXY_STATUS, () => {
  return {
    running: proxy.isRunning(),
    profiles: proxy.getActiveProfiles(),
    port: 9090,
  };
});

ipcMain.handle(IPC.PROXY_ACTIVATE, async (_event, profileId: string) => {
  const profile = loadProfileFromDisk(profileId);
  if (!profile) throw new Error('Site not found.');

  const creds = loadCredentials(profileId);
  if (!creds) throw new Error('No credentials saved. Please log in first.');

  if (!proxy.isRunning()) proxy.start();

  const slug = await proxy.activateProfile(
    profile.manifest,
    profile.authSpec,
    profile.endpoints,
    creds
  );
  return { slug, url: `http://127.0.0.1:9090/${slug}` };
});

ipcMain.handle(IPC.PROXY_DEACTIVATE, (_event, slug: string) => {
  proxy.deactivateProfile(slug);
  return true;
});

// IPC: Agent-driven build flow
let activeAgent: AgentDriver | null = null;

ipcMain.handle(IPC.AGENT_START, async (_event, url: string, webContentsId: number, editOpts?: { existingProfileId?: string; existingWorkflowId?: string }) => {
  log.info('ipc', `AGENT_START url=${url} wcId=${webContentsId} edit=${JSON.stringify(editOpts || {})}`);

  // Clear all cookies from the webview partition so each build starts fresh
  const webviewSession = session.fromPartition('persist:target');
  await webviewSession.clearStorageData({ storages: ['cookies'] });
  log.info('ipc', 'Cleared webview cookies for fresh build session');

  // Clean up any existing agent
  if (activeAgent) {
    await activeAgent.cancel();
  }

  const vaultKeys = Object.keys(loadVault());
  activeAgent = new AgentDriver(
    claude,
    (msg) => mainWindow?.webContents.send(IPC.AGENT_MESSAGE, msg),
    () => broadcastTokenUsage(),
    { ...editOpts, vaultKeys },
  );

  // Start is async; it runs the agent loop in the background
  activeAgent.start(url, webContentsId).catch((err) => {
    mainWindow?.webContents.send(IPC.AGENT_MESSAGE, {
      id: Date.now().toString(),
      role: 'system',
      content: `Agent error: ${err.message}`,
    });
  });

  return true;
});

ipcMain.handle(IPC.AGENT_REPLY, async (_event, text: string) => {
  if (!activeAgent) throw new Error('No active agent session.');
  await activeAgent.handleUserReply(text);
  return true;
});

ipcMain.handle(IPC.AGENT_CREDENTIALS, async () => {
  // Reserved for future use; credentials now handled via embedded browser
  return true;
});

ipcMain.handle(IPC.AGENT_CONFIRM, async (_event, parameterOverrides?: { stepIndex: number; isParameter: boolean; parameterName: string }[]) => {
  if (!activeAgent) throw new Error('No active agent session.');
  const result = await activeAgent.handleConfirm(parameterOverrides);

  // Save everything to disk
  const data = result as any;
  if (data._manifest && data._authSpec && data._capability) {
    // New site: save profile + capability
    saveProfileToDisk(data._manifest.id, data._manifest, data._authSpec, []);
    saveWorkflow(profilesDir(), data._capability);
  } else if (data._capability) {
    // Editing existing site: just save the updated capability
    saveWorkflow(profilesDir(), data._capability);
  }

  // Save session cookies from the webview — these are needed to replay capabilities.
  // The user logged in during the build flow; these cookies are the auth session.
  const profileId = result.profileId;
  try {
    const webviewSession = session.fromPartition('persist:target');
    const allCookies = await webviewSession.cookies.get({});
    // Filter to the site's domain
    const profile = loadProfileFromDisk(profileId);
    let siteCookies = allCookies;
    if (profile?.manifest.siteBaseUrl) {
      try {
        const hostname = new URL(profile.manifest.siteBaseUrl).hostname;
        siteCookies = allCookies.filter((c) =>
          c.domain && (hostname.endsWith(c.domain.replace(/^\./, '')) || c.domain.replace(/^\./, '').endsWith(hostname))
        );
      } catch { /* use all cookies */ }
    }
    if (siteCookies.length > 0 && safeStorage.isEncryptionAvailable()) {
      const cookieData = siteCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '',
        path: c.path || '/',
        secure: c.secure || false,
        httpOnly: c.httpOnly || false,
      }));
      const encrypted = safeStorage.encryptString(JSON.stringify(cookieData));
      fs.writeFileSync(path.join(getProfilePath(profileId), 'session.enc'), encrypted);
      log.info('ipc', `Saved ${siteCookies.length} session cookies for ${profileId}`);
    }
  } catch (err: any) {
    log.warn('ipc', `Failed to save session cookies`, err.message);
  }

  mainWindow?.webContents.send(IPC.AGENT_COMPLETE, {
    profileId: result.profileId,
    workflowId: result.workflowId,
  });

  activeAgent = null;
  return result;
});

ipcMain.handle(IPC.AGENT_CANCEL, async () => {
  if (activeAgent) {
    await activeAgent.cancel();
    activeAgent = null;
  }
  return true;
});

// IPC: Account status
ipcMain.handle('account:status', async () => {
  const savedLicenseKey = loadLicenseKey();
  if (!savedLicenseKey) {
    return { accountType: 'none', trialDaysLeft: 0, email: null, isLoggedIn: false };
  }

  const trialDaysTotal = 7;
  let accountType: 'trial' | 'expired' | 'subscribed' | 'contributor' | 'cancelled' = 'trial';
  let trialDaysLeft = trialDaysTotal;
  let email: string | null = null;

  try {
    const res = await fetch(`${SERVER_URL}/api/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: savedLicenseKey }),
    });
    const data = await res.json() as any;
    if (data.valid) {
      email = data.email || null;

      // Calculate trial from account creation date
      if (data.createdAt) {
        const elapsed = (Date.now() - new Date(data.createdAt).getTime()) / 1000 / 60 / 60 / 24;
        trialDaysLeft = Math.max(0, Math.ceil(trialDaysTotal - elapsed));
      }

      const status = data.subscriptionStatus || 'none';
      if (data.contributorStatus === 'approved') {
        accountType = 'contributor';
      } else if (status === 'active' || status === 'trialing') {
        accountType = 'subscribed';
      } else if (status === 'cancelled' || status === 'past_due') {
        accountType = 'cancelled';
      } else if (trialDaysLeft <= 0) {
        accountType = 'expired';
      }
    }
  } catch {
    // Server unreachable, assume trial based on local fallback
    const firstSeen = getMachineFirstSeen();
    if (firstSeen) {
      const elapsed = (Date.now() - new Date(firstSeen).getTime()) / 1000 / 60 / 60 / 24;
      trialDaysLeft = Math.max(0, Math.ceil(trialDaysTotal - elapsed));
      if (trialDaysLeft <= 0) accountType = 'expired';
    }
  }

  return { accountType, trialDaysLeft, email, isLoggedIn: true };
});

// IPC: Submit site to public library
ipcMain.handle('site:submit', async (_event, profileId: string) => {
  const savedKey = loadLicenseKey();
  if (!savedKey) return { error: 'Log in first to submit.' };

  const profile = loadProfileFromDisk(profileId);
  if (!profile) return { error: 'Site not found.' };

  const wfs = listWorkflows(profilesDir(), profileId);
  if (wfs.length === 0) return { error: 'Add at least one capability before submitting.' };

  try {
    const res = await fetch(`${SERVER_URL}/api/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedKey}`,
      },
      body: JSON.stringify({
        profileJson: profile.manifest,
        authSpecJson: profile.authSpec,
        endpointsJson: profile.endpoints,
        capabilities: wfs.map((w: any) => w.name || w.description || 'Unnamed'),
      }),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      return { error: data.error || 'Submission failed.' };
    }
    return {
      success: true,
      submissionId: data.submissionId,
      githubPr: data.githubPr || null,
    };
  } catch (err: any) {
    return { error: err.message || 'Server unreachable.' };
  }
});

// IPC: Fetch user profile from server
ipcMain.handle('account:profile', async () => {
  const savedKey = loadLicenseKey();
  if (!savedKey) return null;
  try {
    const res = await fetch(`${SERVER_URL}/api/account/profile`, {
      headers: { 'Authorization': `Bearer ${savedKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
});

// IPC: Update user profile
ipcMain.handle('account:update-profile', async (_event, updates: Record<string, string>) => {
  const savedKey = loadLicenseKey();
  if (!savedKey) return { error: 'Not logged in.' };
  try {
    const res = await fetch(`${SERVER_URL}/api/account/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedKey}` },
      body: JSON.stringify(updates),
    });
    return await res.json() as any;
  } catch (err: any) {
    return { error: err.message || 'Server unreachable.' };
  }
});

// IPC: Check submission status
ipcMain.handle('site:submission-status', async (_event, profileId: string) => {
  const savedKey = loadLicenseKey();
  if (!savedKey) return { submitted: false };
  try {
    const res = await fetch(`${SERVER_URL}/api/submissions?profileId=${profileId}`, {
      headers: { 'Authorization': `Bearer ${savedKey}` },
    });
    return await res.json() as any;
  } catch { return { submitted: false }; }
});

// IPC: Subscribe via Stripe
ipcMain.handle('account:subscribe', async () => {
  const savedKey = loadLicenseKey();
  if (!savedKey) return { error: 'Log in first to subscribe.' };

  try {
    const res = await fetch(`${SERVER_URL}/api/stripe/checkout-by-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: savedKey }),
    });
    const data = await res.json() as any;
    if (data.url) {
      const { shell: electronShell } = require('electron');
      electronShell.openExternal(data.url);
      return { success: true };
    }
    return { error: data.error || 'Could not create checkout.' };
  } catch (err: any) {
    return { error: err.message || 'Server unreachable.' };
  }
});

// IPC: Manage subscription (Stripe billing portal)
ipcMain.handle('account:manage-subscription', async () => {
  const savedKey = loadLicenseKey();
  if (!savedKey) return { error: 'Log in first.' };

  try {
    const res = await fetch(`${SERVER_URL}/api/stripe/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: savedKey }),
    });
    const data = await res.json() as any;
    if (data.url) {
      const { shell: electronShell } = require('electron');
      electronShell.openExternal(data.url);
      return { success: true };
    }
    return { error: data.error || 'Could not open billing portal.' };
  } catch (err: any) {
    return { error: err.message || 'Server unreachable.' };
  }
});

// IPC: Check if user can use Purroxy (trial/subscription check)
ipcMain.handle('account:can-use', async () => {
  const savedKey = loadLicenseKey();
  if (!savedKey) return { allowed: false, reason: 'Log in to use Purroxy.' };

  try {
    const res = await fetch(`${SERVER_URL}/api/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: savedKey }),
    });
    const data = await res.json() as any;
    if (data.valid) {
      if (data.contributorStatus === 'approved') return { allowed: true };
      if (data.subscriptionStatus === 'active' || data.subscriptionStatus === 'trialing') return { allowed: true };
      // Check trial from server createdAt
      if (data.createdAt) {
        const elapsed = (Date.now() - new Date(data.createdAt).getTime()) / 1000 / 60 / 60 / 24;
        if (elapsed < 7) return { allowed: true };
      }
    }
  } catch {
    // Server unreachable, deny
  }

  return { allowed: false, reason: 'Your free trial has ended. Subscribe or publish a site for free access.' };
});

// IPC: Settings
ipcMain.handle('settings:get', () => {
  return appSettings;
});

ipcMain.handle('settings:save', (_event, settings: AppSettings) => {
  appSettings = { ...DEFAULT_SETTINGS, ...settings };
  saveSettings(appSettings);
  return true;
});

// IPC: Lock
ipcMain.handle('lock:status', () => {
  return { locked: isLocked, hasPin: loadLockPin() !== null };
});

ipcMain.handle('lock:unlock', (_event, pin: string) => {
  const stored = loadLockPin();
  if (!stored) return { success: false, error: 'No PIN set.' };
  if (pin !== stored) return { success: false, error: 'Wrong PIN.' };
  isLocked = false;
  lastActivityTime = Date.now();
  return { success: true };
});

ipcMain.handle('lock:lock', () => {
  isLocked = true;
  return true;
});

ipcMain.handle('lock:set-pin', (_event, pin: string) => {
  saveLockPin(pin);
  return true;
});

ipcMain.handle('lock:has-pin', () => {
  return { hasPin: loadLockPin() !== null };
});

ipcMain.handle('lock:clear-pin', () => {
  clearLockPin();
  appSettings.autoLockEnabled = false;
  saveSettings(appSettings);
  isLocked = false;
  return true;
});

// IPC: Open Claude Desktop with a prompt
ipcMain.handle('claude:open', async (_event, prompt: string) => {
  // 1. Check if Purroxy is configured in Claude Desktop
  const config = readClaudeConfig();
  if (!config) {
    return { error: 'claude_not_installed', message: 'Claude Desktop does not appear to be installed. Download it from claude.ai/download' };
  }
  if (!config.mcpServers?.purroxy) {
    return { error: 'purroxy_not_configured', message: 'Purroxy is not configured in Claude Desktop yet. Click Setup Claude to install it.' };
  }

  // 2. Copy prompt to clipboard
  const { clipboard } = require('electron');
  clipboard.writeText(prompt);

  // 3. Try to open Claude Desktop
  const { execSync: execSyncCmd } = require('child_process');
  try {
    if (process.platform === 'darwin') {
      execSyncCmd('open -a "Claude"', { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      execSyncCmd('cmd /c start "" "Claude"', { stdio: 'ignore' });
    } else {
      execSyncCmd('claude-desktop', { stdio: 'ignore' });
    }
  } catch {
    return { error: 'claude_not_installed', message: 'Could not open Claude Desktop. Make sure it is installed. Download it from claude.ai/download' };
  }

  return { success: true, message: 'Prompt copied to clipboard. Paste it in Claude Desktop to get started.' };
});

// IPC: Vault
ipcMain.handle('vault:list', () => {
  // Returns key names only, never values
  return Object.keys(loadVault());
});

ipcMain.handle('vault:set', (_event, key: string, value: string) => {
  const vault = loadVault();
  vault[key] = value;
  saveVault(vault);
  return true;
});

ipcMain.handle('vault:delete', (_event, key: string) => {
  const vault = loadVault();
  delete vault[key];
  saveVault(vault);
  return true;
});

// Internal only: get a vault value for Playwright injection (never exposed to renderer)
ipcMain.handle('vault:get-value', (_event, key: string) => {
  const vault = loadVault();
  return vault[key] || null;
});

// Check which required vault keys are present
ipcMain.handle('vault:check-keys', (_event, keys: string[]) => {
  const vault = loadVault();
  const missing = keys.filter((k) => !vault[k]);
  return { complete: missing.length === 0, missing };
});

// IPC: Export sites backup (no sensitive data)
ipcMain.handle('backup:export', async () => {
  const { dialog } = require('electron');
  const archiver = require('archiver');
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export sites backup',
    defaultPath: `purroxy-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return { cancelled: true };

  const output = fs.createWriteStream(result.filePath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  const profDir = profilesDir();
  if (fs.existsSync(profDir)) {
    const entries = fs.readdirSync(profDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(profDir, entry.name);
      // Include profile.json, auth-spec.json, workflows/, but NOT session.enc, credentials.enc, vault.enc
      for (const file of ['profile.json', 'auth-spec.json', 'endpoints.json']) {
        const fp = path.join(dir, file);
        if (fs.existsSync(fp)) archive.file(fp, { name: `${entry.name}/${file}` });
      }
      const wfDir = path.join(dir, 'workflows');
      if (fs.existsSync(wfDir)) {
        archive.directory(wfDir, `${entry.name}/workflows`);
      }
    }
  }

  await archive.finalize();
  await new Promise((resolve) => output.on('close', resolve));
  return { success: true, path: result.filePath };
});

// IPC: Open a file in the OS default editor
ipcMain.handle('shell:open-file', async (_event, filePath: string) => {
  // Resolve ~ to home directory
  const resolved = filePath.replace(/^~/, app.getPath('home'));
  const dir = path.dirname(resolved);
  // Create the file if it doesn't exist (Claude Desktop config may not exist yet)
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, '{\n  "mcpServers": {}\n}\n');
  }
  return shell.openPath(resolved);
});

// App lifecycle
app.whenReady().then(() => {
  // Restore saved keys
  const savedKey = loadEncryptedKey();
  if (savedKey) {
    apiKey = savedKey;
    claude.setApiKey(savedKey);
    proxy.setApiKey(savedKey);
  }
  const savedLicense = loadLicenseKey();
  if (savedLicense) licenseKey = savedLicense;

  // Strip X-Frame-Options and frame-ancestors CSP from the webview's session
  // so sites like porkbun.com don't block their account/login pages from loading.
  const webviewSession = session.fromPartition('persist:target');
  webviewSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    // Remove headers that block framing (case-insensitive)
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'x-frame-options') {
        delete headers[key];
      }
      if (lower === 'content-security-policy') {
        // Strip just the frame-ancestors directive, keep the rest
        const values = headers[key];
        if (values) {
          headers[key] = values.map((v) =>
            v.replace(/frame-ancestors\s+[^;]+(;|$)/gi, '').trim()
          ).filter(Boolean);
        }
      }
    }
    callback({ responseHeaders: headers });
  });

  // Ensure machine license exists (persistent, survives uninstall)
  const machineId = ensureMachineLicense();
  if (!licenseKey) {
    licenseKey = machineId;
  }
  log.info('app', `Machine ID: ${machineId}`);

  // Load settings
  appSettings = loadSettings();

  // Auto-start the local proxy so MCP server can connect immediately
  proxy.setProfilesDir(profilesDir());
  proxy.setSubscriptionChecker(async () => {
    const firstSeen = getMachineFirstSeen();
    if (firstSeen) {
      const elapsed = (Date.now() - new Date(firstSeen).getTime()) / 1000 / 60 / 60 / 24;
      if (elapsed < 7) return { allowed: true };
    }
    const savedKey = loadLicenseKey();
    if (savedKey) {
      try {
        const res = await fetch(`${SERVER_URL}/api/license/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: savedKey }),
        });
        const data = await res.json() as any;
        if (data.valid) {
          if (data.contributorStatus === 'approved') return { allowed: true };
          if (data.subscriptionStatus === 'active' || data.subscriptionStatus === 'trialing') return { allowed: true };
        }
      } catch { /* fall through */ }
    }
    return { allowed: false, reason: 'Free trial ended. Subscribe or publish a site for free access.' };
  });
  proxy.setLockChecker(() => isLocked);
  proxy.setOnActivity(() => recordActivity());
  proxy.setActivityLogger((entry) => {
    mainWindow?.webContents.send('proxy:activity', entry);
  });
  proxy.start();
  log.info('app', `Proxy started on localhost:9090`);

  // Auto-lock timer: check every 30 seconds
  setInterval(() => checkAutoLock(), 30000);

  // Track mouse activity in the main window
  setInterval(() => {
    if (mainWindow && mainWindow.isFocused()) {
      recordActivity();
    }
  }, 10000);

  log.info('app', `Purroxy started. Logs: ${log.getLogDir()}`);

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, '../../../build/icon.png'));
  }
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
