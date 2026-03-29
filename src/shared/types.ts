// Captured HTTP request/response pair
export interface CapturedRequest {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string;
}

export interface CapturedResponse {
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
  mimeType: string;
}

export interface CapturedExchange {
  request: CapturedRequest;
  response: CapturedResponse;
}

// Discovered API endpoint (output of Claude analysis)
export interface DiscoveredEndpoint {
  id: string;
  name: string;
  description: string;
  method: string;
  urlPattern: string;
  headers: Record<string, string>;
  parameters: EndpointParameter[];
  exampleBody?: string;
  exampleResponse?: string;
}

export interface EndpointParameter {
  name: string;
  location: 'path' | 'query' | 'body' | 'header';
  type: string;
  required: boolean;
  description: string;
  exampleValue: string;
}

// Execution result
export interface ExecutionResult {
  endpointId: string;
  timestamp: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  };
  durationMs: number;
}

// Auth specification (output of auth discovery)
export interface AuthSpec {
  siteName: string;
  siteBaseUrl: string;
  authType:
    | 'session_cookie'
    | 'bearer_token'
    | 'oauth2_authorization_code'
    | 'oauth2_implicit'
    | 'api_key'
    | 'custom';
  loginEndpoint: {
    method: string;
    url: string;
    contentType: string;
    credentialFields: CredentialField[];
    staticFields?: StaticField[];
  };
  csrf?: {
    tokenSource: 'html_meta' | 'cookie' | 'endpoint' | 'none';
    tokenSourceUrl?: string;
    tokenFieldName?: string;
    tokenHeaderName?: string;
  };
  sessionMechanism: {
    type: 'cookie' | 'bearer_header' | 'custom_header';
    cookieNames?: string[];
    headerName?: string;
    tokenLocationInResponse?: string;
  };
  tokenRefresh?: {
    endpoint: string;
    method: string;
    usesRefreshToken: boolean;
  };
  preLoginSteps?: PreLoginStep[];
}

export interface CredentialField {
  name: string;
  type: 'username' | 'email' | 'password' | 'totp' | 'other';
  location: 'body' | 'header' | 'query';
}

export interface StaticField {
  name: string;
  value: string;
  location: 'body' | 'header' | 'query';
}

export interface PreLoginStep {
  description: string;
  method: string;
  url: string;
  extract?: string;
}

// Stored credentials for a site
export interface SiteCredentials {
  siteId: string;
  siteBaseUrl: string;
  fields: Record<string, string>;
}

// Profile manifest (the publishable identity of a profile)
export interface ProfileManifest {
  id: string;
  version: number;
  schemaVersion: 1;
  name: string;
  description: string;
  siteName: string;
  siteBaseUrl: string;
  category: string;
  tags: string[];
  authType: AuthSpec['authType'];
  endpointCount: number;
  createdAt: string;
  updatedAt: string;
  creatorId?: string;
  creatorName: string;
  publishedAt?: string;
  faviconUrl?: string;
  checksum: string;
}

// Local-only profile metadata (never published)
export interface ProfileMeta {
  source: 'local' | 'library';
  downloadedAt?: string;
  usageCount: number;
  lastExecutedAt?: string;
}

// Full profile info for the Library UI
export interface ProfileInfo {
  manifest: ProfileManifest;
  meta: ProfileMeta;
  hasCredentials: boolean;
  hasEndpoints: boolean;
}

// Auth analysis result (from Claude)
export interface AuthAnalysisResult {
  message: string;
  authSpec: AuthSpec;
}

// Action analysis result (from Claude)
export interface ActionAnalysisResult {
  message: string;
  endpoints: DiscoveredEndpoint[];
  actionDescription: string;
}

// --- Capability (new model) ---

// A capability is a reusable task that Claude can perform on a site.
// At runtime: Playwright loads targetUrl with saved cookies, then Claude
// reads the page and extracts data guided by the goal and hints.
export interface Capability {
  id: string;
  name: string;
  description: string;
  profileId: string;
  targetUrl: string;                         // Where to navigate (e.g., "https://mail.yahoo.com")
  goal: string;                              // What to do (e.g., "Get recent emails from the inbox")
  hints: string[];                           // Navigation/extraction hints from the build session
  inputs: CapabilityInput[];                 // Runtime parameters (e.g., search_term)
  requiredVaultKeys?: string[];              // Vault keys needed to run (e.g., ["credit_card_number"])
  outputShape?: Record<string, unknown>;     // Example output structure
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  defaultValue?: string;
}

// Result of running a capability
export interface CapabilityRunResult {
  capabilityId: string;
  success: boolean;
  data: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

// --- Legacy Workflow Types (being phased out) ---

// A browser action recorded during a step
export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'press' | 'select' | 'wait' | 'scroll';
  selector?: string;        // CSS selector for the target element
  value?: string;           // Literal value or "{param_name}" for dynamic
  url?: string;             // For 'navigate'
  key?: string;             // For 'press' (e.g., 'Enter')
  waitFor?: string;         // CSS selector or 'networkidle'
  description: string;      // Human-readable: "Type search term into search box"
}

// Data extraction from the DOM after a step
export interface DataExtraction {
  type: 'single' | 'list';
  containerSelector: string;          // CSS selector for the container
  fields: DataExtractionField[];
  pagination?: {
    nextSelector: string;             // CSS selector for "next page" button
    maxPages?: number;
  };
}

export interface DataExtractionField {
  name: string;
  selector: string;       // Relative selector within the container
  attribute: string;       // 'textContent', 'href', 'data-id', 'value', etc.
}

// How a step parameter gets its value
export interface ParamBinding {
  paramName: string;
  description: string;
  source: 'fixed' | 'input' | 'step';
  fixedValue?: string;                     // For 'fixed'
  inputLabel?: string;                     // For 'input' (user provides at runtime)
  stepRef?: {
    stepId: string;
    outputName: string;
    jsonPath?: string;                     // e.g., "expiry_date" or "[].id"
  };
}

// A condition expression for branching
export interface ConditionExpr {
  left: string;                            // Reference: "stepId.outputName.field"
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists' | 'not_exists';
  right: string;                           // Literal value or another reference
}

// The output a step produces
export interface StepOutput {
  name: string;
  type: 'value' | 'list';
  description: string;
}

// A single step in a workflow
export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'extract' | 'foreach' | 'condition';

  // For 'action': browser actions to perform
  actions?: BrowserAction[];

  // For 'extract': what to pull from the page
  extraction?: DataExtraction;

  // For 'foreach': which output to iterate over
  iterateOver?: string;                    // "step1.domains"
  children?: WorkflowStep[];

  // For 'condition': branch logic
  condition?: ConditionExpr;
  elseChildren?: WorkflowStep[];

  // Parameter bindings (inputs to this step)
  paramBindings: ParamBinding[];

  // What this step produces (for downstream steps)
  outputs?: StepOutput[];

  // Execution mode hint (set by Claude during analysis)
  executionMode?: 'playwright' | 'http';

  // Reference to a DiscoveredEndpoint if this step has an HTTP fast-path
  endpointId?: string;
}

// A complete workflow
export interface Workflow {
  id: string;
  name: string;
  description: string;
  profileId: string;                       // The profile this workflow belongs to
  steps: WorkflowStep[];
  inputs: WorkflowInput[];                 // Parameters the user provides at runtime
  createdAt: string;
  updatedAt: string;
}

// A runtime input parameter for the workflow
export interface WorkflowInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  defaultValue?: string;
}

// Result of running a workflow
export interface WorkflowRunResult {
  workflowId: string;
  success: boolean;
  stepsExecuted: number;
  totalSteps: number;
  durationMs: number;
  outputs: Record<string, unknown>;        // Aggregated outputs from all steps
  errors?: { stepId: string; stepName: string; error: string }[];
}

// Agent chat message types
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options?: { label: string; value: string }[];
  credentialRequest?: {
    siteName: string;
    fields: { name: string; label: string; type: 'text' | 'password' | 'email' }[];
  };
  resultData?: {
    summary: string;
    description?: string;
    data: Record<string, unknown>;
    typedValues?: {
      stepIndex: number;
      selector: string;
      description: string;
      value: string;
      isParameter: boolean;
      parameterName: string;
    }[];
  };
  isProgress?: boolean;
  showBrowser?: boolean;
}

// Recorded step during agent-driven build (for crystallization)
export interface RecordedStep {
  action: BrowserAction;
  isCredential: boolean;
  credentialFieldName?: string;
  userInputParamName?: string;
  userInputValue?: string;
}

// IPC channel names
export const IPC = {
  // Capture
  ATTACH_CAPTURE: 'capture:attach',
  DETACH_CAPTURE: 'capture:detach',
  CAPTURE_EXCHANGE: 'capture:exchange',

  // Recording session control
  START_RECORDING: 'capture:start-recording',
  STOP_RECORDING: 'capture:stop-recording',

  // Claude
  ANALYZE_WITH_CLAUDE: 'claude:analyze',
  CLAUDE_STREAM: 'claude:stream',
  ANALYZE_AUTH: 'claude:analyze-auth',
  ANALYZE_ACTION: 'claude:analyze-action',

  // Endpoints
  EXECUTE_ENDPOINT: 'endpoint:execute',

  // Settings
  VALIDATE_API_KEY: 'settings:validate-api-key',
  SET_API_KEY: 'settings:set-api-key',
  GET_API_KEY: 'settings:get-api-key',
  CLEAR_API_KEY: 'settings:clear-api-key',

  // Profiles
  LIST_PROFILES: 'profiles:list',
  LOAD_PROFILE: 'profiles:load',
  SAVE_PROFILE: 'profiles:save',
  DELETE_PROFILE: 'profiles:delete',

  // Credentials (per-profile)
  SAVE_CREDENTIALS: 'credentials:save',
  GET_CREDENTIALS: 'credentials:get',
  CLEAR_CREDENTIALS: 'credentials:clear',

  // License
  SET_LICENSE_KEY: 'license:set',
  GET_LICENSE_KEY: 'license:get',
  VALIDATE_LICENSE: 'license:validate',

  // Library
  INSTALL_PROFILE: 'marketplace:install',

  // Action recording
  GET_RECORDER_SCRIPT: 'recorder:get-script',
  ANALYZE_STEP: 'recorder:analyze-step',

  // Workflows
  SAVE_WORKFLOW: 'workflow:save',
  LOAD_WORKFLOW: 'workflow:load',
  LIST_WORKFLOWS: 'workflow:list',
  DELETE_WORKFLOW: 'workflow:delete',

  // Usage
  CHECK_USAGE: 'usage:check',
  INCREMENT_USAGE: 'usage:increment',

  // Token tracking
  GET_TOKEN_USAGE: 'tokens:get',
  TOKEN_USAGE_UPDATE: 'tokens:update',

  // Agent
  AGENT_START: 'agent:start',
  AGENT_REPLY: 'agent:reply',
  AGENT_CREDENTIALS: 'agent:credentials',
  AGENT_CONFIRM: 'agent:confirm',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_MESSAGE: 'agent:message',
  AGENT_COMPLETE: 'agent:complete',

  // MCP
  EXPORT_MCP_CONFIG: 'mcp:export-config',

  // Proxy
  PROXY_START: 'proxy:start',
  PROXY_STOP: 'proxy:stop',
  PROXY_STATUS: 'proxy:status',
  PROXY_ACTIVATE: 'proxy:activate',
  PROXY_DEACTIVATE: 'proxy:deactivate',
} as const;
