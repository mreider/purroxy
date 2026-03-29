import Anthropic from '@anthropic-ai/sdk';
import { CapturedExchange, DiscoveredEndpoint, EndpointParameter, AuthSpec, AuthAnalysisResult, ActionAnalysisResult } from '../shared/types';
import { randomUUID } from 'crypto';

const SYSTEM_PROMPT = `You are an API discovery assistant for the app "Purroxy".

Your job is to analyze captured HTTP traffic from a website and help the user discover and define usable API endpoints.

You work in a structured, iterative process:
1. First, understand what the website is and what it does based on the traffic.
2. Propose what endpoints you can identify from the traffic.
3. For each endpoint, extract: HTTP method, URL pattern, required headers, parameters, and example request/response.
4. Be precise. Only describe what you can see in the actual traffic. Never hallucinate endpoints or parameters.
5. If you need more data, tell the user exactly what action to record next.

When the user asks you to analyze traffic, respond using the define_endpoints tool to structure your findings.
Also provide a conversational explanation of what you found.`;

const AUTH_DISCOVERY_SYSTEM_PROMPT = `You are an authentication reverse-engineering assistant for "Purroxy".

You will receive all HTTP traffic captured during a user's login flow on a website. Your job is to identify:

1. **Authentication mechanism**: What type of auth does this site use?
   - Username/password form POST → session cookie
   - Username/password → JWT/Bearer token
   - OAuth2 authorization code flow
   - OAuth2 implicit flow
   - API key in headers
   - SAML/SSO redirect
   - Multi-factor authentication steps

2. **Login endpoint**: The specific HTTP request that submits credentials. Include:
   - Method, URL, Content-Type
   - What fields are submitted (username, password, email, etc.)
   - Any hidden fields (CSRF tokens, client IDs, etc.)

3. **Token/session issuance**: How does the server respond?
   - Set-Cookie headers (session cookies, auth cookies)
   - Response body containing access_token, refresh_token, JWT
   - Redirect with tokens in URL fragment or query params

4. **Session maintenance**: How are subsequent authenticated requests made?
   - Cookie header with session ID
   - Authorization: Bearer <token>
   - Custom headers (X-Auth-Token, etc.)

5. **CSRF protection**: If present, how are CSRF tokens obtained and submitted?

6. **Token refresh**: If tokens expire, what refresh mechanism exists?

Be precise. Only report what you observe in the actual traffic. If you see an OAuth redirect, trace the full flow. If you see CSRF tokens, identify where they originate.

Use the define_auth_spec tool to structure your findings. Also provide a brief conversational explanation.`;

const ACTION_DISCOVERY_SYSTEM_PROMPT = `You are an API action discovery assistant for "Purroxy".

You will receive:
1. A description of an action the user just performed on a website
2. All HTTP traffic captured during that action
3. The known authentication mechanism for this site (already discovered)

Your job is to identify the BUSINESS API calls: the minimum set of HTTP requests needed to programmatically replay this action.

Rules:
- IGNORE authentication plumbing (login, token refresh, CSRF fetches). That's already handled separately.
- IGNORE static asset loads, analytics, telemetry, error tracking (Sentry, etc.), and ad/tracking requests.
- IGNORE OPTIONS preflight requests.
- Focus on the API calls that actually accomplish the action the user described.
- If multiple requests are needed in sequence (e.g., create resource then add attributes), preserve the ordering and note data dependencies between them.
- For each call, identify which values are user-provided parameters vs. which are fixed/derived.
- Be precise about URL patterns. If a URL contains an ID that varies, mark it as {parameter}.
- Do NOT include auth headers in endpoint definitions. They are injected automatically at execution time.

Use the define_endpoints tool to structure your findings. Also provide a brief conversational explanation.`;

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'define_endpoints',
    description: 'Define discovered API endpoints from the captured traffic. Call this with all endpoints you can identify.',
    input_schema: {
      type: 'object' as const,
      properties: {
        site_name: {
          type: 'string',
          description: 'Human-readable name for the website',
        },
        site_description: {
          type: 'string',
          description: 'Brief description of what the site does',
        },
        endpoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Camel-case name like "listInvoices" or "createProject"',
              },
              description: {
                type: 'string',
                description: 'What this endpoint does',
              },
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
              },
              url_pattern: {
                type: 'string',
                description: 'URL with path parameters marked as {param}',
              },
              headers: {
                type: 'object',
                description: 'Required headers (excluding standard browser headers)',
              },
              parameters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    location: {
                      type: 'string',
                      enum: ['path', 'query', 'body', 'header'],
                    },
                    type: { type: 'string' },
                    required: { type: 'boolean' },
                    description: { type: 'string' },
                    example_value: { type: 'string' },
                  },
                  required: ['name', 'location', 'type', 'required', 'description', 'example_value'],
                },
              },
              example_body: { type: 'string' },
              example_response: { type: 'string' },
            },
            required: ['name', 'description', 'method', 'url_pattern'],
          },
        },
      },
      required: ['site_name', 'site_description', 'endpoints'],
    },
  },
];


// --- Agent-driven build flow ---

const AGENT_SYSTEM_PROMPT = `You are Purroxy, an AI agent that builds reusable capabilities for Claude to use on websites that require the user's login.

You drive an embedded browser. The user cannot see it unless you hand control to them.

## Core principle
You are building a REUSABLE TEMPLATE, not performing a one-off task. The capability you build will be saved and run many times with different inputs. Claude will call it later via MCP.

NEVER suggest capabilities for things Claude can already do without logging in (stock prices, weather, public search, Wikipedia, news). Only capabilities requiring the user's logged-in account.

## Parameters (CRITICAL)
When the user describes a capability with variable parts — "search for a specific word", "check a particular order", "look up a date" — those variable parts are RUNTIME PARAMETERS. Do NOT ask the user for the actual value. Instead:
1. Pick a realistic example value yourself (e.g., "invoice" for a search term)
2. Tell the user briefly: "I'll use 'invoice' as an example to demonstrate."
3. When you type that value into a form field, mark it as a parameter using is_parameter=true in the type_text tool. This records it as a variable that Claude will fill in at runtime.
4. Continue building the capability with the example value.

The saved capability will have named input parameters. When Claude calls it later, it provides the real values.

## Security
When handing control for login, say credentials never leave their machine and no AI can see them.

## Flow
1. If the page is a login page, use hand_to_user IMMEDIATELY. Say only "Log in to continue."
2. After login, suggest 3-5 capabilities as clickable options using ask_user. One short intro, then options. Every suggestion MUST require being logged in.
3. Once the user picks a capability, navigate there yourself. You already know the site. Use navigate to go to the right URL. Do NOT use hand_to_user for navigation unless you get stuck.
4. Dismiss cookie banners proactively with dismiss_popup.
5. For PARAMETERS in the capability (search terms, IDs, dates), pick a realistic example and use type_text with is_parameter=true. Do NOT ask the user what value to use.
6. For FIXED values (clicking navigation, selecting menu items), just do them normally.
7. Call get_page_info after every action to see results.
8. When you find the data, use report_result with a short generic name and one-sentence description.
9. Be concise. No narration. No filler.
10. If an action fails after one retry, use hand_to_user to let the user do it.
11. CAPTCHAs, 2FA, device verification: use hand_to_user.
12. VAULT: If the user has vault keys and the capability involves filling in sensitive data (payment, account numbers), include the relevant vault key names in required_vault_keys on report_result. Add a hint like "Fill payment field from vault:credit_card_number". At runtime, Purroxy injects vault values directly; Claude never sees them.`;

export const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'get_page_info',
    description: 'Get the current page state: URL, title, forms, buttons, links, headings, and visible text. Call this after every navigation or click to see what changed.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'navigate',
    description: 'Navigate the browser to a URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Full URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'click',
    description: 'Click an element on the page by CSS selector.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to click' },
        description: { type: 'string', description: 'Brief description of what this click does' },
      },
      required: ['selector', 'description'],
    },
  },
  {
    name: 'type_text',
    description: 'Clear an input field and type text into it. If this value is a RUNTIME PARAMETER (the user said "a specific X", "a certain Y"), set is_parameter=true and provide a parameter_name. Use a realistic example as the text value.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the input field' },
        text: { type: 'string', description: 'Text to type. If is_parameter=true, this is an example value.' },
        description: { type: 'string', description: 'Brief description of what this field is for' },
        is_parameter: { type: 'boolean', description: 'True if this value should be a runtime parameter (provided by Claude when the capability is called). Default false.' },
        parameter_name: { type: 'string', description: 'Snake_case name for the parameter, e.g. "search_term", "order_id", "date_range". Required when is_parameter=true.' },
      },
      required: ['selector', 'text', 'description'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a keyboard key (Enter, Tab, Escape, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Key name: Enter, Tab, Escape, ArrowDown, etc.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'select_option',
    description: 'Select an option from a dropdown/select element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of the select element' },
        value: { type: 'string', description: 'Option value to select' },
        description: { type: 'string' },
      },
      required: ['selector', 'value', 'description'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        direction: { type: 'string', enum: ['down', 'up'], description: 'Scroll direction' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'wait_for',
    description: 'Wait for an element to appear or for the network to settle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for, or "networkidle"' },
        timeout: { type: 'number', description: 'Max wait in ms (default 5000)' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'dismiss_popup',
    description: 'Try to dismiss cookie banners, consent modals, or notification popups. Call this when you see popup/banner elements on the page.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'ask_user',
    description: 'Ask the user a question. Use this when you need input (search terms, IDs, choices) or want to present clickable options. For the initial goal selection, always provide options.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The question to display to the user' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Button label shown to user' },
              value: { type: 'string', description: 'Value returned when clicked' },
            },
            required: ['label', 'value'],
          },
          description: 'Optional clickable option buttons. If provided, user can click one or type their own response.',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'hand_to_user',
    description: 'Show the embedded browser to the user so they can interact directly. Use this for login pages, CAPTCHAs, 2FA, device verification, or anything requiring human interaction. Be specific in your message about what the user should do (e.g., "Please log in to Yahoo Mail. Complete any 2FA or verification steps, then click Done.").',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Clear instruction for the user, e.g. "Please log in to Yahoo Mail. Handle any verification steps, then click Done."' },
      },
      required: ['message'],
    },
  },
  {
    name: 'report_result',
    description: 'Present the final result to the user for confirmation. Call this when you have found and extracted the data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        capability_name: {
          type: 'string',
          description: 'Short, generic name. 2-5 words. Examples: "Check my email", "View account balance".',
        },
        capability_description: {
          type: 'string',
          description: 'One sentence describing what this capability does generically.',
        },
        target_url: {
          type: 'string',
          description: 'The URL where this capability should start. The page that has the data or the form to fill.',
        },
        goal: {
          type: 'string',
          description: 'What Claude should do at runtime when loading this page. E.g., "Find recent emails in the inbox and extract sender, subject, and date for each."',
        },
        hints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Navigation and extraction hints. Things you learned about the site structure. E.g., "The inbox list is the main content area", "Each message row has sender, subject, and timestamp", "Unread messages are bold". Include URL paths if relevant.',
        },
        inputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'snake_case parameter name' },
              type: { type: 'string', enum: ['string', 'number', 'boolean'] },
              description: { type: 'string' },
              required: { type: 'boolean' },
            },
            required: ['name', 'type', 'description', 'required'],
          },
          description: 'Runtime input parameters. E.g., search_term for a search capability.',
        },
        required_vault_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Vault key names this capability needs at runtime. E.g., ["credit_card_number"]. Only include if the capability fills in sensitive data from the vault.',
        },
        data: {
          type: 'object',
          description: 'Sample structured data extracted from the page right now',
        },
      },
      required: ['capability_name', 'capability_description', 'target_url', 'goal', 'hints', 'data'],
    },
  },
];

const AUTH_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'define_auth_spec',
    description: 'Define the authentication specification discovered from the login traffic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        site_name: { type: 'string', description: 'Human-readable name for the website' },
        site_base_url: { type: 'string', description: 'Base URL of the site (e.g., https://app.example.com)' },
        auth_type: {
          type: 'string',
          enum: ['session_cookie', 'bearer_token', 'oauth2_authorization_code', 'oauth2_implicit', 'api_key', 'custom'],
          description: 'Primary authentication mechanism',
        },
        login_endpoint: {
          type: 'object',
          properties: {
            method: { type: 'string' },
            url: { type: 'string' },
            content_type: { type: 'string' },
            credential_fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Field name as sent in the request' },
                  type: { type: 'string', enum: ['username', 'email', 'password', 'totp', 'other'] },
                  location: { type: 'string', enum: ['body', 'header', 'query'] },
                },
                required: ['name', 'type', 'location'],
              },
            },
            static_fields: {
              type: 'array',
              description: 'Fields with fixed values (grant_type, client_id, etc.)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'string' },
                  location: { type: 'string', enum: ['body', 'header', 'query'] },
                },
                required: ['name', 'value', 'location'],
              },
            },
          },
          required: ['method', 'url', 'content_type', 'credential_fields'],
        },
        csrf: {
          type: 'object',
          description: 'CSRF protection details, if any',
          properties: {
            token_source: { type: 'string', enum: ['html_meta', 'cookie', 'endpoint', 'none'] },
            token_source_url: { type: 'string' },
            token_field_name: { type: 'string' },
            token_header_name: { type: 'string' },
          },
        },
        session_mechanism: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['cookie', 'bearer_header', 'custom_header'] },
            cookie_names: { type: 'array', items: { type: 'string' } },
            header_name: { type: 'string' },
            token_location_in_response: { type: 'string', description: 'JSONPath or description of where the token appears in the login response' },
          },
          required: ['type'],
        },
        token_refresh: {
          type: 'object',
          description: 'Token refresh mechanism, if observed',
          properties: {
            endpoint: { type: 'string' },
            method: { type: 'string' },
            uses_refresh_token: { type: 'boolean' },
          },
        },
        pre_login_steps: {
          type: 'array',
          description: 'Steps required before login (e.g., fetch CSRF token, load login page)',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              method: { type: 'string' },
              url: { type: 'string' },
              extract: { type: 'string', description: 'What to extract from the response' },
            },
          },
        },
      },
      required: ['site_name', 'site_base_url', 'auth_type', 'login_endpoint', 'session_mechanism'],
    },
  },
];

interface AnalysisResult {
  message: string;
  endpoints: DiscoveredEndpoint[];
  siteName: string;
  siteDescription: string;
}

export class ClaudeAnalyzer {
  private client: Anthropic | null = null;
  private conversationHistory: Anthropic.Messages.MessageParam[] = [];
  private sessionTokens = { input: 0, output: 0 };

  getSessionTokens(): { input: number; output: number; total: number } {
    return {
      input: this.sessionTokens.input,
      output: this.sessionTokens.output,
      total: this.sessionTokens.input + this.sessionTokens.output,
    };
  }

  private trackUsage(response: Anthropic.Messages.Message): void {
    if (response.usage) {
      this.sessionTokens.input += response.usage.input_tokens;
      this.sessionTokens.output += response.usage.output_tokens;
    }
  }

  setApiKey(key: string): void {
    this.client = new Anthropic({ apiKey: key });
    this.conversationHistory = [];
  }

  hasApiKey(): boolean {
    return this.client !== null;
  }

  async analyzeTraffic(
    exchanges: CapturedExchange[],
    userMessage?: string,
    onStream?: (text: string) => void
  ): Promise<AnalysisResult> {
    if (!this.client) {
      throw new Error('Anthropic API key not set');
    }

    // Build the traffic summary for Claude
    const trafficSummary = this.buildTrafficSummary(exchanges);

    const prompt = userMessage
      ? `${userMessage}\n\nHere is the captured HTTP traffic:\n\n${trafficSummary}`
      : `Please analyze this captured HTTP traffic and identify any API endpoints.\n\n${trafficSummary}`;

    this.conversationHistory.push({ role: 'user', content: prompt });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: this.conversationHistory,
    });
    this.trackUsage(response);

    // Process the response
    let textContent = '';
    let endpoints: DiscoveredEndpoint[] = [];
    let siteName = '';
    let siteDescription = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
        if (onStream) onStream(block.text);
      } else if (block.type === 'tool_use' && block.name === 'define_endpoints') {
        const input = block.input as Record<string, unknown>;
        siteName = (input.site_name as string) || '';
        siteDescription = (input.site_description as string) || '';
        const rawEndpoints = (input.endpoints as Record<string, unknown>[]) || [];
        endpoints = rawEndpoints.map((ep) => this.parseEndpoint(ep));
      }
    }

    // Add assistant response to conversation history
    this.conversationHistory.push({ role: 'assistant', content: response.content });

    // If tool was used, send tool result back
    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    if (toolUseBlock && toolUseBlock.type === 'tool_use') {
      this.conversationHistory.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: `Endpoints saved successfully. Found ${endpoints.length} endpoints.`,
          },
        ],
      });
    }

    return {
      message: textContent,
      endpoints,
      siteName,
      siteDescription,
    };
  }

  async chat(
    userMessage: string,
    onStream?: (text: string) => void
  ): Promise<AnalysisResult> {
    if (!this.client) {
      throw new Error('Anthropic API key not set');
    }

    this.conversationHistory.push({ role: 'user', content: userMessage });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: this.conversationHistory,
    });
    this.trackUsage(response);

    let textContent = '';
    let endpoints: DiscoveredEndpoint[] = [];
    let siteName = '';
    let siteDescription = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
        if (onStream) onStream(block.text);
      } else if (block.type === 'tool_use' && block.name === 'define_endpoints') {
        const input = block.input as Record<string, unknown>;
        siteName = (input.site_name as string) || '';
        siteDescription = (input.site_description as string) || '';
        const rawEndpoints = (input.endpoints as Record<string, unknown>[]) || [];
        endpoints = rawEndpoints.map((ep) => this.parseEndpoint(ep));
      }
    }

    this.conversationHistory.push({ role: 'assistant', content: response.content });

    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    if (toolUseBlock && toolUseBlock.type === 'tool_use') {
      this.conversationHistory.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: `Endpoints saved successfully. Found ${endpoints.length} endpoints.`,
          },
        ],
      });
    }

    return { message: textContent, endpoints, siteName, siteDescription };
  }

  async runAgentTurn(
    messages: Anthropic.Messages.MessageParam[],
    timeoutMs = 120000,
  ): Promise<Anthropic.Messages.Message> {
    if (!this.client) throw new Error('Anthropic API key not set');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0,
        system: AGENT_SYSTEM_PROMPT,
        tools: AGENT_TOOLS,
        messages,
      }, { signal: controller.signal as any });
      this.trackUsage(response);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  getClient(): Anthropic | null {
    return this.client;
  }

  resetConversation(): void {
    this.conversationHistory = [];
  }

  async analyzeAuthFlow(
    exchanges: CapturedExchange[],
    onStream?: (text: string) => void
  ): Promise<AuthAnalysisResult> {
    if (!this.client) throw new Error('Anthropic API key not set');

    const trafficSummary = this.buildTrafficSummary(exchanges, true);
    const prompt = `Analyze this login flow traffic and identify the authentication mechanism.\n\n${trafficSummary}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0,
      system: AUTH_DISCOVERY_SYSTEM_PROMPT,
      tools: AUTH_TOOLS,
      messages: [{ role: 'user', content: prompt }],
    });
    this.trackUsage(response);

    let textContent = '';
    let authSpec: AuthSpec | null = null;

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
        if (onStream) onStream(block.text);
      } else if (block.type === 'tool_use' && block.name === 'define_auth_spec') {
        authSpec = this.parseAuthSpec(block.input as Record<string, unknown>);
      }
    }

    if (!authSpec) {
      throw new Error(
        textContent || 'Could not identify an authentication mechanism. Make sure you completed the full login flow before stopping.'
      );
    }

    return { message: textContent, authSpec };
  }

  async analyzeAction(
    exchanges: CapturedExchange[],
    actionDescription: string,
    authSpec: AuthSpec,
    onStream?: (text: string) => void
  ): Promise<ActionAnalysisResult> {
    if (!this.client) throw new Error('Anthropic API key not set');

    const trafficSummary = this.buildTrafficSummary(exchanges, false);
    const authContext = `Known auth: ${authSpec.authType} via ${authSpec.sessionMechanism.type}. Login endpoint: ${authSpec.loginEndpoint.method} ${authSpec.loginEndpoint.url}`;

    const prompt = `The user performed this action: "${actionDescription}"

${authContext}

Here is the captured HTTP traffic during this action:

${trafficSummary}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0,
      system: ACTION_DISCOVERY_SYSTEM_PROMPT,
      tools: TOOLS,
      messages: [{ role: 'user', content: prompt }],
    });
    this.trackUsage(response);

    let textContent = '';
    let endpoints: DiscoveredEndpoint[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
        if (onStream) onStream(block.text);
      } else if (block.type === 'tool_use' && block.name === 'define_endpoints') {
        const input = block.input as Record<string, unknown>;
        const rawEndpoints = (input.endpoints as Record<string, unknown>[]) || [];
        endpoints = rawEndpoints.map((ep) => this.parseEndpoint(ep));
      }
    }

    return { message: textContent, endpoints, actionDescription };
  }

  private parseAuthSpec(raw: Record<string, unknown>): AuthSpec {
    const login = raw.login_endpoint as Record<string, unknown>;
    const session = raw.session_mechanism as Record<string, unknown>;
    const csrf = raw.csrf as Record<string, unknown> | undefined;
    const refresh = raw.token_refresh as Record<string, unknown> | undefined;
    const preSteps = raw.pre_login_steps as Record<string, unknown>[] | undefined;

    return {
      siteName: (raw.site_name as string) || '',
      siteBaseUrl: (raw.site_base_url as string) || '',
      authType: (raw.auth_type as AuthSpec['authType']) || 'custom',
      loginEndpoint: {
        method: (login.method as string) || 'POST',
        url: (login.url as string) || '',
        contentType: (login.content_type as string) || 'application/json',
        credentialFields: ((login.credential_fields as Record<string, unknown>[]) || []).map((f) => ({
          name: (f.name as string) || '',
          type: (f.type as 'username' | 'email' | 'password' | 'totp' | 'other') || 'other',
          location: (f.location as 'body' | 'header' | 'query') || 'body',
        })),
        staticFields: ((login.static_fields as Record<string, unknown>[]) || []).map((f) => ({
          name: (f.name as string) || '',
          value: (f.value as string) || '',
          location: (f.location as 'body' | 'header' | 'query') || 'body',
        })),
      },
      csrf: csrf
        ? {
            tokenSource: (csrf.token_source as 'html_meta' | 'cookie' | 'endpoint' | 'none') || 'none',
            tokenSourceUrl: csrf.token_source_url as string | undefined,
            tokenFieldName: csrf.token_field_name as string | undefined,
            tokenHeaderName: csrf.token_header_name as string | undefined,
          }
        : undefined,
      sessionMechanism: {
        type: (session.type as 'cookie' | 'bearer_header' | 'custom_header') || 'cookie',
        cookieNames: session.cookie_names as string[] | undefined,
        headerName: session.header_name as string | undefined,
        tokenLocationInResponse: session.token_location_in_response as string | undefined,
      },
      tokenRefresh: refresh
        ? {
            endpoint: (refresh.endpoint as string) || '',
            method: (refresh.method as string) || 'POST',
            usesRefreshToken: (refresh.uses_refresh_token as boolean) ?? false,
          }
        : undefined,
      preLoginSteps: preSteps?.map((s) => ({
        description: (s.description as string) || '',
        method: (s.method as string) || 'GET',
        url: (s.url as string) || '',
        extract: s.extract as string | undefined,
      })),
    };
  }

  private buildTrafficSummary(exchanges: CapturedExchange[], includeHeaders = false): string {
    return exchanges
      .map((ex, i) => {
        const reqHeaders = includeHeaders
          ? `\nRequest Headers: ${JSON.stringify(ex.request.headers, null, 2)}`
          : '';
        const resHeaders = includeHeaders
          ? `\nResponse Headers: ${JSON.stringify(ex.response.headers, null, 2)}`
          : '';
        const reqBody = ex.request.postData
          ? `\nRequest Body: ${this.truncate(ex.request.postData, includeHeaders ? 2000 : 500)}`
          : '';
        const resBody = ex.response.body
          ? `\nResponse Body: ${this.truncate(ex.response.body, includeHeaders ? 4000 : 1000)}`
          : '';

        return `--- Request ${i + 1} ---
${ex.request.method} ${ex.request.url}
Status: ${ex.response.status} ${ex.response.statusText}
Content-Type: ${ex.response.mimeType}${reqHeaders}${resHeaders}${reqBody}${resBody}
`;
      })
      .join('\n');
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + `... [truncated, ${str.length} total chars]`;
  }

  private parseEndpoint(raw: Record<string, unknown>): DiscoveredEndpoint {
    const params = (raw.parameters as Record<string, unknown>[] | undefined) || [];
    return {
      id: randomUUID(),
      name: (raw.name as string) || 'unknown',
      description: (raw.description as string) || '',
      method: (raw.method as string) || 'GET',
      urlPattern: (raw.url_pattern as string) || '',
      headers: (raw.headers as Record<string, string>) || {},
      parameters: params.map(
        (p): EndpointParameter => ({
          name: (p.name as string) || '',
          location: (p.location as EndpointParameter['location']) || 'query',
          type: (p.type as string) || 'string',
          required: (p.required as boolean) ?? false,
          description: (p.description as string) || '',
          exampleValue: (p.example_value as string) || '',
        })
      ),
      exampleBody: raw.example_body as string | undefined,
      exampleResponse: raw.example_response as string | undefined,
    };
  }
}
