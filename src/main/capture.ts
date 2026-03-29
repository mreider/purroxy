import { WebContents } from 'electron';
import { CapturedExchange, CapturedRequest, CapturedResponse } from '../shared/types';
import { randomUUID } from 'crypto';

export class TrafficCapture {
  private exchanges: Map<string, Partial<CapturedExchange>> = new Map();
  private completedExchanges: CapturedExchange[] = [];
  private recording = false;
  private webContents: WebContents | null = null;
  private onExchangeCallback: ((exchange: CapturedExchange) => void) | null = null;

  async start(webContents: WebContents): Promise<void> {
    this.webContents = webContents;
    this.exchanges.clear();
    this.completedExchanges = [];
    this.recording = true;

    const debugger_ = webContents.debugger;

    try {
      debugger_.attach('1.3');
    } catch (err) {
      // Already attached
    }

    await debugger_.sendCommand('Network.enable', {});
    await debugger_.sendCommand('Network.setRequestInterception', {
      patterns: [{ urlPattern: '*', interceptionStage: 'HeadersReceived' }],
    }).catch(() => {
      // Not all versions support this, fall back to passive capture
    });

    debugger_.on('message', (_event: unknown, method: string, params: Record<string, unknown>) => {
      if (!this.recording) return;
      this.handleDebuggerMessage(method, params);
    });
  }

  stop(): CapturedExchange[] {
    this.recording = false;
    if (this.webContents?.debugger.isAttached()) {
      this.webContents.debugger.detach();
    }
    // Flush any partial exchanges
    return [...this.completedExchanges];
  }

  getExchanges(): CapturedExchange[] {
    return [...this.completedExchanges];
  }

  isRecording(): boolean {
    return this.recording;
  }

  // Start a recording session. Clears buffer, begins accumulating exchanges.
  // CDP debugger stays attached; this just controls whether exchanges are collected.
  startRecording(): void {
    this.exchanges.clear();
    this.completedExchanges = [];
    this.recording = true;
  }

  // Stop accumulating exchanges and return what was captured.
  // Does NOT detach the CDP debugger. The webview keeps working.
  stopRecording(): CapturedExchange[] {
    this.recording = false;
    return [...this.completedExchanges];
  }

  onExchange(callback: (exchange: CapturedExchange) => void): void {
    this.onExchangeCallback = callback;
  }

  private handleDebuggerMessage(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case 'Network.requestWillBeSent':
        this.onRequest(params);
        break;
      case 'Network.responseReceived':
        this.onResponse(params);
        break;
      case 'Network.loadingFinished':
        this.onLoadingFinished(params);
        break;
      case 'Network.requestIntercepted':
        this.onRequestIntercepted(params);
        break;
    }
  }

  private onRequest(params: Record<string, unknown>): void {
    const requestId = params.requestId as string;
    const request = params.request as Record<string, unknown>;

    const captured: CapturedRequest = {
      id: requestId || randomUUID(),
      timestamp: Date.now(),
      method: request.method as string,
      url: request.url as string,
      headers: (request.headers as Record<string, string>) || {},
      postData: request.postData as string | undefined,
      resourceType: (params.type as string) || 'Other',
    };

    this.exchanges.set(requestId, { request: captured });
  }

  private onResponse(params: Record<string, unknown>): void {
    const requestId = params.requestId as string;
    const response = params.response as Record<string, unknown>;
    const headers = (response.headers as Record<string, string>) || {};

    const captured: CapturedResponse = {
      requestId,
      status: response.status as number,
      statusText: (response.statusText as string) || '',
      headers,
      mimeType: (response.mimeType as string) || '',
    };

    const exchange = this.exchanges.get(requestId);
    if (exchange) {
      exchange.response = captured;
    }
  }

  private async onLoadingFinished(params: Record<string, unknown>): Promise<void> {
    const requestId = params.requestId as string;
    const exchange = this.exchanges.get(requestId);

    if (exchange?.request && exchange?.response && this.webContents?.debugger.isAttached()) {
      try {
        const result = await this.webContents.debugger.sendCommand(
          'Network.getResponseBody',
          { requestId }
        ) as { body: string; base64Encoded: boolean };
        exchange.response.body = result.base64Encoded
          ? `[base64 encoded, ${result.body.length} chars]`
          : result.body;
      } catch {
        // Body may not be available for all requests
      }

      const completed = exchange as CapturedExchange;
      this.completedExchanges.push(completed);
      this.exchanges.delete(requestId);
      if (this.onExchangeCallback) {
        this.onExchangeCallback(completed);
      }
    }
  }

  private onRequestIntercepted(params: Record<string, unknown>): void {
    // Allow all intercepted requests to continue
    const interceptionId = params.interceptionId as string;
    if (this.webContents?.debugger.isAttached()) {
      this.webContents.debugger.sendCommand('Network.continueInterceptedRequest', {
        interceptionId,
      }).catch(() => {});
    }
  }
}

// Noise patterns: analytics, tracking, ads, telemetry, beacons
const NOISE_DOMAINS = /\b(google-analytics|googletagmanager|googlesyndication|doubleclick|facebook\.com\/tr|segment\.(com|io)|mixpanel|hotjar|fullstory|sentry\.io|newrelic|datadog|bugsnag|rollbar|logrocket|amplitude|heap\.io|intercom|crisp\.chat|drift\.com|hubspot|marketo|pardot|optimizely|crazyegg|mouseflow|trustpilot|cloudflareinsights|eus2-b\/collect)\b/i;
const NOISE_PATHS = /\/(collect|beacon|ping|pixel|track|analytics|telemetry|log|event|impression|v\d+\/t)\b/i;

// Check if an exchange is noise (not useful for API discovery)
export function isNoiseTraffic(ex: CapturedExchange): boolean {
  const url = ex.request.url;
  const resourceType = ex.request.resourceType;

  // Static asset types
  if (['Image', 'Font', 'Stylesheet', 'Media'].includes(resourceType)) return true;

  // Static file extensions
  if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|css|map|js|mjs)(\?|$)/i.test(url)) return true;

  // Script resources (JS files loaded by the page)
  if (resourceType === 'Script') return true;

  // OPTIONS preflight requests
  if (ex.request.method === 'OPTIONS') return true;

  // Known noise domains and paths
  if (NOISE_DOMAINS.test(url)) return true;
  if (NOISE_PATHS.test(url)) return true;

  // Tracking pixels (1x1 images, 204 No Content)
  if (ex.response.status === 204) return true;

  // Data URIs
  if (url.startsWith('data:')) return true;

  return false;
}

// Filter exchanges to only API-like traffic (for Claude analysis)
export function filterApiTraffic(exchanges: CapturedExchange[]): CapturedExchange[] {
  return exchanges.filter((ex) => {
    if (isNoiseTraffic(ex)) return false;

    // Keep JSON, API-like responses
    const contentType = ex.response.headers['content-type'] || ex.response.headers['Content-Type'] || '';
    if (contentType.includes('json') || contentType.includes('xml')) return true;

    // Keep XHR/Fetch type requests
    if (ex.request.resourceType === 'XHR' || ex.request.resourceType === 'Fetch') return true;

    // Keep non-GET requests (likely API mutations)
    if (ex.request.method !== 'GET') return true;

    return false;
  });
}
