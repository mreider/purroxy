import { webContents, WebContents } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { log } from './logger';
import {
  AgentMessage,
  Capability,
  CapabilityInput,
  ProfileManifest,
  AuthSpec,
} from '../shared/types';
import { ClaudeAnalyzer } from './claude';

export class AgentDriver {
  private wc: WebContents | null = null;
  private conversationHistory: Anthropic.Messages.MessageParam[] = [];
  private pendingUserInput: { resolve: (v: string) => void } | null = null;
  private siteUrl = '';
  private siteName = '';
  private cancelled = false;
  private loginHandoffDone = false;

  // Capability building state
  private currentPageUrl = '';
  private resultData: {
    name: string;
    description: string;
    goal: string;
    hints: string[];
    targetUrl: string;
    inputs: CapabilityInput[];
    requiredVaultKeys: string[];
    data: Record<string, unknown>;
  } | null = null;

  private existingProfileId: string | null = null;
  private existingCapabilityId: string | null = null;
  private vaultKeys: string[] = [];

  constructor(
    private claude: ClaudeAnalyzer,
    private emit: (msg: AgentMessage) => void,
    private onTokenUpdate: () => void,
    opts?: { existingProfileId?: string; existingWorkflowId?: string; vaultKeys?: string[] },
  ) {
    if (opts?.existingProfileId) this.existingProfileId = opts.existingProfileId;
    if (opts?.existingWorkflowId) this.existingCapabilityId = opts.existingWorkflowId;
    if (opts?.vaultKeys) this.vaultKeys = opts.vaultKeys;
  }

  async start(url: string, webContentsId: number): Promise<void> {
    this.siteUrl = url.startsWith('http') ? url : 'https://' + url;
    this.cancelled = false;
    this.conversationHistory = [];
    this.resultData = null;
    this.currentPageUrl = this.siteUrl;

    const wc = webContents.fromId(webContentsId);
    if (!wc) throw new Error('Could not find embedded browser');
    this.wc = wc;

    log.info('agent', `Starting agent for ${this.siteUrl} (wcId=${webContentsId})`);

    this.emitStatus('Navigating to ' + this.siteUrl);
    try {
      await this.loadURL(this.siteUrl);
    } catch (err: any) {
      log.error('agent', `Failed to load ${this.siteUrl}`, err.message);
      this.emitAssistant(`I couldn't load that page: ${err.message}. Please check the URL and try again.`);
      return;
    }

    const pageInfo = await this.getPageInfo();
    const vaultContext = this.vaultKeys.length > 0
      ? `\n\nThe user has these vault keys available (you never see the values, they are injected securely at runtime): ${this.vaultKeys.join(', ')}. If a capability involves payments, account numbers, or sensitive data that matches a vault key, mention using it in the hints. Only suggest vault keys when relevant (banking, payments, insurance, not email).`
      : '';
    this.conversationHistory.push({
      role: 'user',
      content: `I want to add ${this.siteUrl} as a Purroxy site so Claude can use it.\n\nHere is the current page:\n\n${pageInfo}${vaultContext}\n\nRules:\n- If it's a login page or requires authentication, use hand_to_user IMMEDIATELY. Say only "Log in to continue." Nothing else.\n- If already logged in, use ask_user with 3-5 capability options. One short intro sentence, then the options.\n- Only suggest things requiring MY logged-in account: checking email, viewing bills, managing subscriptions. Never suggest things Claude can do without logging in.\n- Be concise. No filler. No narration about what you see on the page.\n- We build ONE capability at a time.`,
    });

    await this.runAgentLoop();
  }

  async handleUserReply(text: string): Promise<void> {
    if (this.pendingUserInput) {
      const { resolve } = this.pendingUserInput;
      this.pendingUserInput = null;
      resolve(text);
    }
  }

  async handleConfirm(parameterOverrides?: { stepIndex: number; isParameter: boolean; parameterName: string }[]): Promise<{ profileId: string; workflowId: string }> {
    // Parameter overrides update the inputs on the result
    if (parameterOverrides && this.resultData) {
      const inputs: CapabilityInput[] = [];
      for (const override of parameterOverrides) {
        if (override.isParameter) {
          inputs.push({
            name: override.parameterName,
            type: 'string',
            description: override.parameterName.replace(/_/g, ' '),
            required: true,
          });
        }
      }
      this.resultData.inputs = inputs;
    }
    return await this.crystallize();
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    if (this.pendingUserInput) {
      this.pendingUserInput.resolve('__CANCELLED__');
      this.pendingUserInput = null;
    }
    this.wc = null;
  }

  // --- Internal ---

  private async loadURL(url: string): Promise<void> {
    if (!this.wc || this.wc.isDestroyed()) throw new Error('Browser not available');
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 8000);
      const onDone = () => { clearTimeout(timeout); resolve(); };
      const onFail = (_e: unknown, code: number, desc: string, _url: string, isMainFrame: boolean) => {
        if (!isMainFrame || code === -3) return;
        clearTimeout(timeout);
        reject(new Error(desc || `Load failed (${code})`));
      };
      this.wc!.once('did-finish-load', onDone);
      this.wc!.once('did-fail-load', onFail);
      this.wc!.loadURL(url);
    });
  }

  private async exec(code: string): Promise<unknown> {
    if (!this.wc || this.wc.isDestroyed()) throw new Error('Browser not available');
    return this.wc.executeJavaScript(code);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async runAgentLoop(): Promise<void> {
    const MAX_AUTONOMOUS_TURNS = 4;
    let autonomousTurns = 0;

    while (!this.cancelled) {
      let response: Anthropic.Messages.Message;
      try {
        this.emitStatus('Analyzing page...');
        log.debug('agent', `Calling Claude (${this.conversationHistory.length} messages, autonomous=${autonomousTurns})`);
        response = await this.claude.runAgentTurn(this.conversationHistory);
        this.onTokenUpdate();
        const tools = response.content.filter((b) => b.type === 'tool_use').map((b) => b.type === 'tool_use' ? b.name : '');
        log.info('agent', `Claude responded: stop=${response.stop_reason}, tools=[${tools.join(',')}]`);
      } catch (err: any) {
        log.error('agent', `Claude API error`, err.message);
        this.emitAssistant(`Something went wrong talking to Claude: ${err.message}`);
        return;
      }

      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      const textBlocks = response.content.filter((b) => b.type === 'text');

      for (const block of textBlocks) {
        if (block.type === 'text' && block.text.trim()) {
          this.emitAssistant(block.text);
        }
      }

      this.conversationHistory.push({ role: 'assistant', content: response.content });

      if (toolUseBlocks.length === 0) {
        autonomousTurns = 0;
        this.emit({ id: 'status', role: 'system', content: '', isProgress: false });
        const userReply = await this.waitForUserInput();
        if (this.cancelled) return;
        this.conversationHistory.push({ role: 'user', content: userReply });
        continue;
      }

      const toolNames = toolUseBlocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => b.type === 'tool_use' ? b.name : '');
      const isUserInteraction = toolNames.some((n) =>
        n === 'ask_user' || n === 'hand_to_user' || n === 'report_result'
      );

      if (isUserInteraction) {
        autonomousTurns = 0;
      } else {
        autonomousTurns++;
      }

      // Circuit breaker
      if (autonomousTurns >= MAX_AUTONOMOUS_TURNS) {
        log.warn('agent', `Forcing hand_to_user after ${autonomousTurns} autonomous turns`);
        autonomousTurns = 0;

        this.emit({
          id: randomUUID(),
          role: 'assistant',
          content: "I'm having trouble doing this automatically. Can you do it in the browser? Click Done when you're ready and I'll continue from there.",
          showBrowser: true,
        });

        const reply = await this.waitForUserInput();
        if (this.cancelled) return;

        await this.delay(1000);
        const pageInfo = await this.getPageInfo();

        const syntheticResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks
          .filter((b) => b.type === 'tool_use')
          .map((b) => ({
            type: 'tool_result' as const,
            tool_use_id: b.type === 'tool_use' ? b.id : '',
            content: `Aborted — user took over manually. Current page after their interaction:\n\n${pageInfo}\n\nIMPORTANT: Do NOT retry what you were doing. The user handled it. Continue from the current page state. Be concise.`,
          }));

        this.conversationHistory.push({ role: 'user', content: syntheticResults });
        continue;
      }

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        if (block.type !== 'tool_use') continue;
        if (this.cancelled) return;

        const result = await this.executeTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });

        if (block.name === 'report_result') {
          this.conversationHistory.push({ role: 'user', content: toolResults });
          return;
        }
      }

      this.conversationHistory.push({ role: 'user', content: toolResults });
    }
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    if (!this.wc) return 'Error: browser not available';

    log.debug('agent', `Executing tool: ${name}`, input);
    try {
      switch (name) {
        case 'get_page_info': {
          this.emitStatus('Reading page...');
          return await this.getPageInfo();
        }

        case 'navigate': {
          const url = input.url as string;
          this.emitStatus(`Navigating to ${url}`);
          await this.loadURL(url);
          await this.delay(500);
          this.currentPageUrl = url;
          return await this.getPageInfo();
        }

        case 'click': {
          const selector = input.selector as string;
          const description = (input.description as string) || 'Click element';
          this.emitStatus(`Clicking: ${description}`);
          await this.exec(`(function() {
            var el = document.querySelector(${JSON.stringify(selector)});
            if (el) el.click();
            else throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
          })()`);
          await this.delay(500);
          return await this.getPageInfo();
        }

        case 'type_text': {
          const selector = input.selector as string;
          const text = input.text as string;
          const description = (input.description as string) || 'Type text';
          this.emitStatus(`Typing: ${description}`);
          await this.exec(`(function() {
            var el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error('Element not found');
            el.focus();
            el.value = ${JSON.stringify(text)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })()`);
          return `Typed into ${selector}. ` + await this.getPageInfo();
        }

        case 'press_key': {
          const key = input.key as string;
          this.emitStatus(`Pressing ${key}`);
          await this.exec(`(function() {
            var el = document.activeElement || document.body;
            el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(key)}, bubbles: true }));
            if (${JSON.stringify(key)} === 'Enter') {
              var form = el.closest('form');
              if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
            }
          })()`);
          await this.delay(500);
          return await this.getPageInfo();
        }

        case 'scroll': {
          const direction = input.direction as string;
          const delta = direction === 'up' ? -500 : 500;
          await this.exec(`window.scrollBy(0, ${delta})`);
          return await this.getPageInfo();
        }

        case 'dismiss_popup': {
          this.emitStatus('Dismissing popups');
          const dismissed = await this.exec(`(function() {
            var selectors = [
              '[class*="cookie"] button', '[id*="cookie"] button',
              '[class*="consent"] button', '[id*="consent"] button',
              '[class*="accept"]', '[id*="accept"]',
              'button[aria-label*="close"]', 'button[aria-label*="Close"]',
              'button[aria-label*="dismiss"]', 'button[aria-label*="Dismiss"]',
              '[class*="banner"] button', '[class*="modal"] button[class*="close"]',
              '.cc-dismiss', '.cc-allow', '#onetrust-accept-btn-handler',
              '[data-testid="close-button"]'
            ];
            var dismissed = 0;
            for (var i = 0; i < selectors.length; i++) {
              var el = document.querySelector(selectors[i]);
              if (el && el.offsetParent !== null) {
                el.click();
                dismissed++;
              }
            }
            return dismissed;
          })()`) as number;
          return dismissed > 0
            ? `Dismissed ${dismissed} popup element(s). ` + await this.getPageInfo()
            : 'No popups found to dismiss. ' + await this.getPageInfo();
        }

        case 'ask_user': {
          const message = input.message as string;
          const options = input.options as { label: string; value: string }[] | undefined;

          this.emit({
            id: randomUUID(),
            role: 'assistant',
            content: message,
            options,
          });

          const reply = await this.waitForUserInput();
          if (this.cancelled) return 'User cancelled.';
          return `User replied: "${reply}"`;
        }

        case 'hand_to_user': {
          const message = (input.message as string) || 'Please interact with the browser.';

          this.emit({
            id: randomUUID(),
            role: 'assistant',
            content: message,
            showBrowser: true,
          });

          const reply = await this.waitForUserInput();
          if (this.cancelled) return 'User cancelled.';

          await this.delay(1000);
          // Capture where the user ended up
          try {
            const url = await this.exec('window.location.href') as string;
            if (url) this.currentPageUrl = url;
          } catch { /* ignore */ }
          const pageInfo = await this.getPageInfo();

          if (!this.loginHandoffDone) {
            this.loginHandoffDone = true;
            return `User finished logging in. Current page:\n\n${pageInfo}\n\nIMPORTANT: The user IS logged in now. Do NOT call hand_to_user again for login. Do NOT narrate what you see. Go DIRECTLY to suggesting capabilities using ask_user with clickable options. One short sentence intro, then the options. No filler.`;
          }
          return `User completed the action. Current page:\n\n${pageInfo}\n\nContinue building the capability from this page. Do NOT call hand_to_user again unless absolutely necessary. Be concise.`;
        }

        case 'report_result': {
          const capName = (input.capability_name as string) || 'New capability';
          const capDesc = (input.capability_description as string) || '';
          const goal = (input.goal as string) || capDesc;
          const hints = (input.hints as string[]) || [];
          const targetUrl = (input.target_url as string) || this.currentPageUrl || this.siteUrl;
          const inputs = (input.inputs as CapabilityInput[]) || [];
          const requiredVaultKeys = (input.required_vault_keys as string[]) || [];
          const data = input.data as Record<string, unknown>;

          this.resultData = {
            name: capName,
            description: capDesc,
            goal,
            hints,
            targetUrl,
            inputs,
            requiredVaultKeys,
            data,
          };

          this.emit({
            id: randomUUID(),
            role: 'assistant',
            content: capName,
            resultData: { summary: capName, description: capDesc, data },
          });

          return 'Result presented to user. Waiting for confirmation.';
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: any) {
      log.error('agent', `Tool ${name} failed`, err.message);
      return `Error executing ${name}: ${err.message}`;
    }
  }

  private async getPageInfo(): Promise<string> {
    if (!this.wc) return 'No page available.';

    try {
      const info = await this.exec(`(function() {
        var result = {};
        result.title = document.title;
        result.url = window.location.href;

        var headings = [];
        document.querySelectorAll('h1, h2, h3').forEach(function(h) {
          var text = h.innerText ? h.innerText.trim() : '';
          if (text && text.length < 200) headings.push(h.tagName + ': ' + text);
        });
        result.headings = headings.slice(0, 10);

        var forms = [];
        var allForms = document.querySelectorAll('form');
        for (var fi = 0; fi < allForms.length; fi++) {
          var form = allForms[fi];
          var fields = [];
          form.querySelectorAll('input, select, textarea').forEach(function(el) {
            if (el.type === 'hidden') return;
            var label = '';
            if (el.labels && el.labels[0]) label = el.labels[0].innerText ? el.labels[0].innerText.trim() : '';
            if (!label) label = el.getAttribute('aria-label') || el.placeholder || el.name || '';
            fields.push({ label: label, type: el.type || 'text' });
          });
          if (fields.length > 0) forms.push({ fields: fields });
        }
        result.forms = forms;

        var buttons = [];
        document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach(function(el) {
          if (el.offsetParent === null) return;
          var text = el.innerText ? el.innerText.trim() : (el.value || '');
          if (text) buttons.push(text.slice(0, 80));
        });
        result.buttons = buttons.slice(0, 15);

        var links = [];
        document.querySelectorAll('a[href]').forEach(function(a) {
          if (a.offsetParent === null) return;
          var text = a.innerText ? a.innerText.trim() : '';
          if (text && text.length < 80) links.push({ text: text, href: a.href });
        });
        result.links = links.slice(0, 20);

        var bodyText = document.body.innerText || '';
        result.visibleText = bodyText.slice(0, 2000);

        return result;
      })()`) as Record<string, unknown>;

      // Track current URL
      this.currentPageUrl = info.url as string || this.currentPageUrl;

      let output = `Page: "${info.title}"\nURL: ${info.url}\n`;

      const headings = info.headings as string[];
      if (headings.length > 0) {
        output += `\nHeadings:\n${headings.map((h) => `  ${h}`).join('\n')}\n`;
      }

      const forms = info.forms as Record<string, unknown>[];
      if (forms.length > 0) {
        output += '\nForms:\n';
        for (const form of forms) {
          const fields = form.fields as Record<string, string>[];
          for (const f of fields) {
            output += `  - ${f.type} field: "${f.label}"\n`;
          }
        }
      }

      const buttons = info.buttons as string[];
      if (buttons.length > 0) {
        output += `\nButtons: ${buttons.join(', ')}\n`;
      }

      const links = info.links as Record<string, string>[];
      if (links.length > 0) {
        output += `\nLinks:\n${links.map((l) => `  - "${l.text}" → ${l.href}`).join('\n')}\n`;
      }

      const visibleText = info.visibleText as string;
      if (visibleText) {
        output += `\nVisible text (first 2000 chars):\n${visibleText}\n`;
      }

      return output;
    } catch (err: any) {
      return `Error reading page: ${err.message}`;
    }
  }

  private waitForUserInput(): Promise<string> {
    return new Promise((resolve) => {
      this.pendingUserInput = { resolve };
    });
  }

  private emitAssistant(content: string): void {
    this.emit({ id: randomUUID(), role: 'assistant', content });
  }

  private emitProgress(content: string): void {
    this.emit({ id: randomUUID(), role: 'system', content, isProgress: true });
  }

  private emitStatus(content: string): void {
    this.emit({ id: 'status', role: 'system', content, isProgress: true });
  }

  private async crystallize(): Promise<{ profileId: string; workflowId: string }> {
    const profileId = this.existingProfileId || randomUUID();
    const capabilityId = this.existingCapabilityId || randomUUID();

    let hostname = '';
    try { hostname = new URL(this.siteUrl).hostname; } catch {}
    const name = this.siteName || hostname || this.siteUrl;

    const capability: Capability = {
      id: capabilityId,
      name: this.resultData?.name || 'New capability',
      description: this.resultData?.description || '',
      profileId,
      targetUrl: this.resultData?.targetUrl || this.currentPageUrl || this.siteUrl,
      goal: this.resultData?.goal || this.resultData?.description || '',
      hints: this.resultData?.hints || [],
      inputs: this.resultData?.inputs || [],
      requiredVaultKeys: this.resultData?.requiredVaultKeys?.length ? this.resultData.requiredVaultKeys : undefined,
      outputShape: this.resultData?.data || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Only create profile manifest for new sites
    if (!this.existingProfileId) {
      const manifest: ProfileManifest = {
        id: profileId,
        version: 1,
        schemaVersion: 1,
        name,
        description: `Purroxy site: ${name}`,
        siteName: name,
        siteBaseUrl: this.siteUrl,
        category: '',
        tags: [],
        authType: 'session_cookie',
        endpointCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creatorName: 'You',
        faviconUrl: (() => { try { return `https://www.google.com/s2/favicons?domain=${new URL(this.siteUrl).hostname}&sz=64`; } catch { return undefined; } })(),
        checksum: '',
      };

      const authSpec: AuthSpec = {
        siteName: name,
        siteBaseUrl: this.siteUrl,
        authType: 'session_cookie',
        loginEndpoint: { method: 'POST', url: '', contentType: '', credentialFields: [] },
        sessionMechanism: { type: 'cookie' },
      };

      return {
        profileId,
        workflowId: capabilityId,
        ...({ _manifest: manifest, _authSpec: authSpec, _capability: capability } as any),
      };
    }

    return {
      profileId,
      workflowId: capabilityId,
      ...({ _capability: capability } as any),
    };
  }
}
