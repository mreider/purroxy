import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  ATTACH_CAPTURE: 'capture:attach',
  DETACH_CAPTURE: 'capture:detach',
  CAPTURE_EXCHANGE: 'capture:exchange',
  EXECUTE_ENDPOINT: 'endpoint:execute',
  VALIDATE_API_KEY: 'settings:validate-api-key',
  SET_API_KEY: 'settings:set-api-key',
  GET_API_KEY: 'settings:get-api-key',
  CLEAR_API_KEY: 'settings:clear-api-key',
  LIST_PROFILES: 'profiles:list',
  LOAD_PROFILE: 'profiles:load',
  SAVE_PROFILE: 'profiles:save',
  DELETE_PROFILE: 'profiles:delete',
  SAVE_CREDENTIALS: 'credentials:save',
  GET_CREDENTIALS: 'credentials:get',
  CLEAR_CREDENTIALS: 'credentials:clear',
  SET_LICENSE_KEY: 'license:set',
  GET_LICENSE_KEY: 'license:get',
  VALIDATE_LICENSE: 'license:validate',
  INSTALL_PROFILE: 'marketplace:install',
  CHECK_USAGE: 'usage:check',
  INCREMENT_USAGE: 'usage:increment',
  GET_TOKEN_USAGE: 'tokens:get',
  TOKEN_USAGE_UPDATE: 'tokens:update',
  AGENT_START: 'agent:start',
  AGENT_REPLY: 'agent:reply',
  AGENT_CREDENTIALS: 'agent:credentials',
  AGENT_CONFIRM: 'agent:confirm',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_MESSAGE: 'agent:message',
  AGENT_COMPLETE: 'agent:complete',
  EXPORT_MCP_CONFIG: 'mcp:export-config',
  SAVE_WORKFLOW: 'workflow:save',
  LOAD_WORKFLOW: 'workflow:load',
  LIST_WORKFLOWS: 'workflow:list',
  DELETE_WORKFLOW: 'workflow:delete',
  PROXY_START: 'proxy:start',
  PROXY_STOP: 'proxy:stop',
  PROXY_STATUS: 'proxy:status',
  PROXY_ACTIVATE: 'proxy:activate',
  PROXY_DEACTIVATE: 'proxy:deactivate',
} as const;

contextBridge.exposeInMainWorld('purroxy', {
  // Capture (used by agent-driver via webContentsId)
  attachCapture: (webContentsId: number) =>
    ipcRenderer.invoke(IPC.ATTACH_CAPTURE, webContentsId),
  detachCapture: () =>
    ipcRenderer.invoke(IPC.DETACH_CAPTURE),

  // Endpoint execution
  executeEndpoint: (endpoint: unknown, params?: Record<string, string>) =>
    ipcRenderer.invoke(IPC.EXECUTE_ENDPOINT, endpoint, params),

  // Settings
  validateApiKey: (key: string) => ipcRenderer.invoke(IPC.VALIDATE_API_KEY, key),
  setApiKey: (key: string) => ipcRenderer.invoke(IPC.SET_API_KEY, key),
  getApiKey: () => ipcRenderer.invoke(IPC.GET_API_KEY),
  clearApiKey: () => ipcRenderer.invoke(IPC.CLEAR_API_KEY),

  // Sites (profiles on disk)
  listProfiles: () => ipcRenderer.invoke(IPC.LIST_PROFILES),
  loadProfile: (profileId: string) => ipcRenderer.invoke(IPC.LOAD_PROFILE, profileId),
  saveProfile: (profileId: string, manifest: unknown, authSpec: unknown, endpoints: unknown[]) =>
    ipcRenderer.invoke(IPC.SAVE_PROFILE, profileId, manifest, authSpec, endpoints),
  deleteProfile: (profileId: string) => ipcRenderer.invoke(IPC.DELETE_PROFILE, profileId),

  // Credentials (per-site)
  saveCredentials: (profileId: string, creds: unknown) =>
    ipcRenderer.invoke(IPC.SAVE_CREDENTIALS, profileId, creds),
  getCredentials: (profileId: string) =>
    ipcRenderer.invoke(IPC.GET_CREDENTIALS, profileId),
  clearCredentials: (profileId: string) =>
    ipcRenderer.invoke(IPC.CLEAR_CREDENTIALS, profileId),

  // License
  setLicenseKey: (key: string) => ipcRenderer.invoke(IPC.SET_LICENSE_KEY, key),
  getLicenseKey: () => ipcRenderer.invoke(IPC.GET_LICENSE_KEY),
  validateLicense: () => ipcRenderer.invoke(IPC.VALIDATE_LICENSE),

  // Library
  installProfile: (profileId: string) => ipcRenderer.invoke(IPC.INSTALL_PROFILE, profileId),

  // Usage
  checkUsage: (profileId: string) => ipcRenderer.invoke(IPC.CHECK_USAGE, profileId),
  incrementUsage: (profileId: string) => ipcRenderer.invoke(IPC.INCREMENT_USAGE, profileId),

  // Capabilities (workflows on disk)
  saveWorkflow: (workflow: unknown) => ipcRenderer.invoke(IPC.SAVE_WORKFLOW, workflow),
  loadWorkflow: (profileId: string, workflowId: string) =>
    ipcRenderer.invoke(IPC.LOAD_WORKFLOW, profileId, workflowId),
  listWorkflows: (profileId: string) => ipcRenderer.invoke(IPC.LIST_WORKFLOWS, profileId),
  deleteWorkflow: (profileId: string, workflowId: string) =>
    ipcRenderer.invoke(IPC.DELETE_WORKFLOW, profileId, workflowId),

  // MCP
  exportMcpConfig: () => ipcRenderer.invoke(IPC.EXPORT_MCP_CONFIG),
  checkMcpInstalled: () => ipcRenderer.invoke('mcp:check'),
  installMcpConfig: () => ipcRenderer.invoke('mcp:install'),
  uninstallMcpConfig: () => ipcRenderer.invoke('mcp:uninstall'),

  // Proxy
  proxyStart: () => ipcRenderer.invoke(IPC.PROXY_START),
  proxyStop: () => ipcRenderer.invoke(IPC.PROXY_STOP),
  proxyStatus: () => ipcRenderer.invoke(IPC.PROXY_STATUS),
  proxyActivate: (profileId: string) => ipcRenderer.invoke(IPC.PROXY_ACTIVATE, profileId),
  proxyDeactivate: (slug: string) => ipcRenderer.invoke(IPC.PROXY_DEACTIVATE, slug),

  // Agent
  agentStart: (url: string, webContentsId: number, editOpts?: { existingProfileId?: string; existingWorkflowId?: string }) => ipcRenderer.invoke(IPC.AGENT_START, url, webContentsId, editOpts),
  agentReply: (text: string) => ipcRenderer.invoke(IPC.AGENT_REPLY, text),
  agentCredentials: (creds: Record<string, string>) => ipcRenderer.invoke(IPC.AGENT_CREDENTIALS, creds),
  agentConfirm: (parameterOverrides?: { stepIndex: number; isParameter: boolean; parameterName: string }[]) => ipcRenderer.invoke(IPC.AGENT_CONFIRM, parameterOverrides),
  agentCancel: () => ipcRenderer.invoke(IPC.AGENT_CANCEL),
  onAgentMessage: (callback: (msg: unknown) => void) => {
    const listener = (_event: unknown, msg: unknown) => callback(msg);
    ipcRenderer.on(IPC.AGENT_MESSAGE, listener);
    return () => ipcRenderer.removeListener(IPC.AGENT_MESSAGE, listener);
  },
  onAgentComplete: (callback: (data: { profileId: string; workflowId: string }) => void) => {
    const listener = (_event: unknown, data: { profileId: string; workflowId: string }) => callback(data);
    ipcRenderer.on(IPC.AGENT_COMPLETE, listener);
    return () => ipcRenderer.removeListener(IPC.AGENT_COMPLETE, listener);
  },

  // Token usage
  getTokenUsage: () => ipcRenderer.invoke(IPC.GET_TOKEN_USAGE),
  onTokenUpdate: (callback: (data: { input: number; output: number; total: number }) => void) => {
    const listener = (_event: unknown, data: { input: number; output: number; total: number }) => callback(data);
    ipcRenderer.on(IPC.TOKEN_USAGE_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.TOKEN_USAGE_UPDATE, listener);
  },

  // Submissions
  submitSite: (profileId: string) => ipcRenderer.invoke('site:submit', profileId),
  getSubmissionStatus: (profileId: string) => ipcRenderer.invoke('site:submission-status', profileId),

  // Account
  getAccountStatus: () => ipcRenderer.invoke('account:status'),
  getProfile: () => ipcRenderer.invoke('account:profile'),
  updateProfile: (updates: Record<string, string>) => ipcRenderer.invoke('account:update-profile', updates),
  canUse: () => ipcRenderer.invoke('account:can-use'),
  subscribe: () => ipcRenderer.invoke('account:subscribe'),
  manageSubscription: () => ipcRenderer.invoke('account:manage-subscription'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { autoLockEnabled: boolean; autoLockMinutes: number }) => ipcRenderer.invoke('settings:save', settings),

  // Lock
  getLockStatus: () => ipcRenderer.invoke('lock:status'),
  unlock: (pin: string) => ipcRenderer.invoke('lock:unlock', pin),
  lock: () => ipcRenderer.invoke('lock:lock'),
  setLockPin: (pin: string) => ipcRenderer.invoke('lock:set-pin', pin),
  hasLockPin: () => ipcRenderer.invoke('lock:has-pin'),
  clearLockPin: () => ipcRenderer.invoke('lock:clear-pin'),
  onLocked: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:locked', listener);
    return () => ipcRenderer.removeListener('app:locked', listener);
  },

  // Vault
  vaultList: () => ipcRenderer.invoke('vault:list'),
  vaultSet: (key: string, value: string) => ipcRenderer.invoke('vault:set', key, value),
  vaultDelete: (key: string) => ipcRenderer.invoke('vault:delete', key),
  vaultCheckKeys: (keys: string[]) => ipcRenderer.invoke('vault:check-keys', keys),

  // Proxy activity
  onProxyActivity: (callback: (entry: { timestamp: string; type: string; site: string; capability: string; status: string; durationMs?: number }) => void) => {
    const listener = (_event: unknown, entry: any) => callback(entry);
    ipcRenderer.on('proxy:activity', listener);
    return () => ipcRenderer.removeListener('proxy:activity', listener);
  },

  // Claude Desktop
  openClaude: (prompt: string) => ipcRenderer.invoke('claude:open', prompt),

  // Shell
  openFile: (filePath: string) => ipcRenderer.invoke('shell:open-file', filePath),

  // Backup
  exportBackup: () => ipcRenderer.invoke('backup:export'),

  // Dev tools
  toggleDevTools: () => ipcRenderer.invoke('devtools:toggle'),
});
