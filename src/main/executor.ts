import { DiscoveredEndpoint, ExecutionResult, AuthSpec, SiteCredentials } from '../shared/types';
import { net } from 'electron';

export class EndpointExecutor {
  private authHeaders: Record<string, string> = {};

  setAuthHeaders(headers: Record<string, string>): void {
    this.authHeaders = { ...headers };
  }

  // Programmatically replay a login flow and extract auth headers
  async replayAuth(authSpec: AuthSpec, credentials: SiteCredentials): Promise<Record<string, string>> {
    // 1. Execute any pre-login steps (e.g., fetch CSRF token)
    let csrfToken: string | undefined;
    if (authSpec.preLoginSteps) {
      for (const step of authSpec.preLoginSteps) {
        const res = await this.rawRequest(step.method, step.url, {});
        if (step.extract && res.body) {
          // Simple extraction: look for the token in meta tags or JSON
          const metaMatch = res.body.match(/name="csrf[^"]*"\s+content="([^"]+)"/i)
            || res.body.match(/content="([^"]+)"\s+name="csrf[^"]*"/i);
          if (metaMatch) {
            csrfToken = metaMatch[1];
          } else {
            // Try JSON extraction
            try {
              const json = JSON.parse(res.body);
              const keys = step.extract.split('.');
              let val: any = json;
              for (const k of keys) { val = val?.[k]; }
              if (typeof val === 'string') csrfToken = val;
            } catch { /* not JSON */ }
          }
        }
      }
    }

    // 2. Build the login request
    const loginHeaders: Record<string, string> = {};
    if (authSpec.loginEndpoint.contentType) {
      loginHeaders['Content-Type'] = authSpec.loginEndpoint.contentType;
    }
    if (csrfToken && authSpec.csrf?.tokenHeaderName) {
      loginHeaders[authSpec.csrf.tokenHeaderName] = csrfToken;
    }

    // Build body/query from credential fields + static fields
    const bodyFields: Record<string, string> = {};
    for (const field of authSpec.loginEndpoint.credentialFields) {
      const value = credentials.fields[field.name] || '';
      if (field.location === 'body') bodyFields[field.name] = value;
      else if (field.location === 'header') loginHeaders[field.name] = value;
    }
    if (authSpec.loginEndpoint.staticFields) {
      for (const field of authSpec.loginEndpoint.staticFields) {
        if (field.location === 'body') bodyFields[field.name] = field.value;
        else if (field.location === 'header') loginHeaders[field.name] = field.value;
      }
    }
    if (csrfToken && authSpec.csrf?.tokenFieldName) {
      bodyFields[authSpec.csrf.tokenFieldName] = csrfToken;
    }

    let body: string | undefined;
    if (Object.keys(bodyFields).length > 0) {
      if (loginHeaders['Content-Type']?.includes('json')) {
        body = JSON.stringify(bodyFields);
      } else {
        body = new URLSearchParams(bodyFields).toString();
        if (!loginHeaders['Content-Type']) {
          loginHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }
    }

    // 3. Execute the login request
    const loginRes = await this.rawRequest(
      authSpec.loginEndpoint.method,
      authSpec.loginEndpoint.url,
      loginHeaders,
      body
    );

    // 4. Extract auth headers from the response
    const resultHeaders: Record<string, string> = {};

    if (authSpec.sessionMechanism.type === 'cookie') {
      // Collect Set-Cookie headers
      const setCookies = loginRes.headers['set-cookie'] || loginRes.headers['Set-Cookie'];
      if (setCookies) {
        resultHeaders['Cookie'] = setCookies
          .split(/,(?=\s*\w+=)/)
          .map((c: string) => c.split(';')[0].trim())
          .join('; ');
      }
    } else if (authSpec.sessionMechanism.type === 'bearer_header') {
      // Extract token from response body
      try {
        const json = JSON.parse(loginRes.body);
        const token = json.access_token || json.token || json.jwt;
        if (token) {
          const headerName = authSpec.sessionMechanism.headerName || 'Authorization';
          resultHeaders[headerName] = headerName.toLowerCase() === 'authorization'
            ? `Bearer ${token}`
            : token;
        }
      } catch { /* not JSON */ }
    } else if (authSpec.sessionMechanism.type === 'custom_header') {
      try {
        const json = JSON.parse(loginRes.body);
        const token = json.access_token || json.token;
        if (token && authSpec.sessionMechanism.headerName) {
          resultHeaders[authSpec.sessionMechanism.headerName] = token;
        }
      } catch { /* not JSON */ }
    }

    this.authHeaders = resultHeaders;
    return resultHeaders;
  }

  private rawRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    return new Promise((resolve, reject) => {
      const request = net.request({ method, url });
      for (const [key, value] of Object.entries(headers)) {
        request.setHeader(key, value);
      }

      let responseBody = '';
      let responseHeaders: Record<string, string> = {};

      request.on('response', (response) => {
        for (const name of Object.keys(response.headers || {})) {
          const val = response.headers[name];
          responseHeaders[name] = Array.isArray(val) ? val.join(', ') : val;
        }
        response.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
        response.on('end', () => {
          resolve({ status: response.statusCode, headers: responseHeaders, body: responseBody });
        });
      });

      request.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
      if (body) request.write(body);
      request.end();
    });
  }

  async execute(
    endpoint: DiscoveredEndpoint,
    paramValues?: Record<string, string>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Resolve URL pattern with parameter values
    let url = endpoint.urlPattern;
    if (paramValues) {
      for (const [key, value] of Object.entries(paramValues)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    // Build query string from query parameters
    const queryParams = endpoint.parameters.filter((p) => p.location === 'query');
    if (queryParams.length > 0) {
      const searchParams = new URLSearchParams();
      for (const param of queryParams) {
        const value = paramValues?.[param.name] || param.exampleValue;
        if (value) searchParams.set(param.name, value);
      }
      const qs = searchParams.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    // Merge headers
    const headers: Record<string, string> = {
      ...this.authHeaders,
      ...endpoint.headers,
    };

    // Build body for non-GET requests
    let body: string | undefined;
    if (endpoint.method !== 'GET' && endpoint.exampleBody) {
      body = endpoint.exampleBody;
      if (paramValues) {
        // Simple substitution in the body
        for (const [key, value] of Object.entries(paramValues)) {
          body = body.replace(`{${key}}`, value);
        }
      }
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    return new Promise((resolve, reject) => {
      const request = net.request({
        method: endpoint.method,
        url,
      });

      // Set headers
      for (const [key, value] of Object.entries(headers)) {
        request.setHeader(key, value);
      }

      let responseBody = '';
      let responseHeaders: Record<string, string> = {};
      let responseStatus = 0;
      let responseStatusText = '';

      request.on('response', (response) => {
        responseStatus = response.statusCode;
        responseStatusText = response.statusMessage;
        responseHeaders = {};
        for (const name of response.headers ? Object.keys(response.headers) : []) {
          const val = response.headers[name];
          responseHeaders[name] = Array.isArray(val) ? val.join(', ') : val;
        }

        response.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString();
        });

        response.on('end', () => {
          resolve({
            endpointId: endpoint.id,
            timestamp: Date.now(),
            request: {
              method: endpoint.method,
              url,
              headers,
              body,
            },
            response: {
              status: responseStatus,
              statusText: responseStatusText,
              headers: responseHeaders,
              body: responseBody,
            },
            durationMs: Date.now() - startTime,
          });
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      if (body) {
        request.write(body);
      }

      request.end();
    });
  }
}
