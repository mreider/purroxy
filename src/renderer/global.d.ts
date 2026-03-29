import {
  DiscoveredEndpoint,
  ExecutionResult,
  AuthSpec,
  SiteCredentials,
  ProfileManifest,
  ProfileInfo,
  Workflow,
  AgentMessage,
} from '../shared/types';

declare global {
  interface Window {
    purroxy: {
      // Capture
      attachCapture: (webContentsId: number) => Promise<boolean>;
      detachCapture: () => Promise<boolean>;

      // Endpoints
      executeEndpoint: (
        endpoint: DiscoveredEndpoint,
        params?: Record<string, string>
      ) => Promise<ExecutionResult>;

      // Settings
      validateApiKey: (key: string) => Promise<boolean>;
      setApiKey: (key: string) => Promise<boolean>;
      getApiKey: () => Promise<string | null>;
      clearApiKey: () => Promise<boolean>;

      // Sites
      listProfiles: () => Promise<ProfileInfo[]>;
      loadProfile: (profileId: string) => Promise<{
        manifest: ProfileManifest;
        authSpec: AuthSpec;
        endpoints: DiscoveredEndpoint[];
      }>;
      saveProfile: (
        profileId: string,
        manifest: ProfileManifest,
        authSpec: AuthSpec,
        endpoints: DiscoveredEndpoint[]
      ) => Promise<boolean>;
      deleteProfile: (profileId: string) => Promise<boolean>;

      // Credentials (per-site)
      saveCredentials: (profileId: string, creds: SiteCredentials) => Promise<boolean>;
      getCredentials: (profileId: string) => Promise<SiteCredentials | null>;
      clearCredentials: (profileId: string) => Promise<boolean>;

      // License
      setLicenseKey: (key: string) => Promise<boolean>;
      getLicenseKey: () => Promise<string | null>;
      validateLicense: () => Promise<{ valid: boolean; userId?: string; subscriptionStatus?: string; error?: string }>;

      // Library
      installProfile: (profileId: string) => Promise<boolean>;

      // Usage
      checkUsage: (profileId: string) => Promise<{
        allowed: boolean;
        executionCount?: number;
        limit?: number;
        requiresSubscription?: boolean;
        noAccount?: boolean;
        error?: string;
      }>;
      incrementUsage: (profileId: string) => Promise<{ executionCount?: number; error?: string }>;

      // Agent
      agentStart: (url: string, webContentsId: number, editOpts?: { existingProfileId?: string; existingWorkflowId?: string }) => Promise<void>;
      agentReply: (text: string) => Promise<void>;
      agentCredentials: (creds: Record<string, string>) => Promise<void>;
      agentConfirm: (parameterOverrides?: { stepIndex: number; isParameter: boolean; parameterName: string }[]) => Promise<{ profileId: string; workflowId: string }>;
      agentCancel: () => Promise<void>;
      onAgentMessage: (callback: (msg: AgentMessage) => void) => () => void;
      onAgentComplete: (callback: (data: { profileId: string; workflowId: string }) => void) => () => void;

      // Token usage
      getTokenUsage: () => Promise<{ input: number; output: number; total: number }>;
      onTokenUpdate: (callback: (data: { input: number; output: number; total: number }) => void) => () => void;

      // Capabilities
      saveWorkflow: (workflow: Workflow) => Promise<boolean>;
      loadWorkflow: (profileId: string, workflowId: string) => Promise<Workflow | null>;
      listWorkflows: (profileId: string) => Promise<Workflow[]>;
      deleteWorkflow: (profileId: string, workflowId: string) => Promise<boolean>;

      // Submissions
      submitSite: (profileId: string) => Promise<{ success?: boolean; error?: string; submissionId?: string; githubPr?: string | null }>;
      getSubmissionStatus: (profileId: string) => Promise<{ submitted: boolean; status?: string; rejectionReason?: string; submittedAt?: string; reviewedAt?: string }>;

      // Account
      canUse: () => Promise<{ allowed: boolean; reason?: string }>;
      subscribe: () => Promise<{ success?: boolean; error?: string }>;
      manageSubscription: () => Promise<{ success?: boolean; error?: string }>;
      getProfile: () => Promise<{ email: string; displayName: string | null; subscriptionStatus: string; contributorStatus: string; createdAt: string } | null>;
      updateProfile: (updates: Record<string, string>) => Promise<{ success?: boolean; error?: string; emailChanged?: boolean; message?: string }>;
      getAccountStatus: () => Promise<{
        accountType: 'trial' | 'expired' | 'subscribed' | 'contributor' | 'cancelled';
        trialDaysLeft: number;
        email: string | null;
        isLoggedIn: boolean;
      }>;

      // Settings
      getSettings: () => Promise<{ autoLockEnabled: boolean; autoLockMinutes: number }>;
      saveSettings: (settings: { autoLockEnabled: boolean; autoLockMinutes: number }) => Promise<boolean>;

      // Lock
      getLockStatus: () => Promise<{ locked: boolean; hasPin: boolean }>;
      unlock: (pin: string) => Promise<{ success: boolean; error?: string }>;
      lock: () => Promise<boolean>;
      setLockPin: (pin: string) => Promise<boolean>;
      hasLockPin: () => Promise<{ hasPin: boolean }>;
      clearLockPin: () => Promise<boolean>;
      onLocked: (callback: () => void) => () => void;

      // Vault
      vaultList: () => Promise<string[]>;
      vaultSet: (key: string, value: string) => Promise<boolean>;
      vaultDelete: (key: string) => Promise<boolean>;
      vaultCheckKeys: (keys: string[]) => Promise<{ complete: boolean; missing: string[] }>;

      // Proxy activity
      onProxyActivity: (callback: (entry: { timestamp: string; type: string; site: string; capability: string; status: string; durationMs?: number }) => void) => () => void;

      // Claude Desktop
      openClaude: (prompt: string) => Promise<{ success?: boolean; error?: string; message: string }>;

      // Shell
      openFile: (filePath: string) => Promise<string>;

      // MCP
      checkMcpInstalled: () => Promise<{ installed: boolean }>;
      installMcpConfig: () => Promise<{ installed: boolean }>;
      uninstallMcpConfig: () => Promise<{ uninstalled: boolean }>;
      exportMcpConfig: () => Promise<{
        config: Record<string, { command: string; args: string[] }>;
        configPath: string;
        instructions: string;
      }>;

      // Backup
      exportBackup: () => Promise<{ success?: boolean; cancelled?: boolean; path?: string; error?: string }>;

      // Proxy
      proxyStart: () => Promise<boolean>;
      proxyStop: () => Promise<boolean>;
      proxyStatus: () => Promise<{
        running: boolean;
        profiles: { slug: string; name: string; endpointCount: number; paused: boolean }[];
        port: number;
      }>;
      proxyActivate: (profileId: string) => Promise<{ slug: string; url: string }>;
      proxyDeactivate: (slug: string) => Promise<boolean>;
    };
  }
}

export {};
