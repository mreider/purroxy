import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { chromium, Browser } from 'playwright';

// Test that cookies set in one browser context can be transferred to another.
// This simulates the webview -> Playwright session transfer.

let server: http.Server;
let port: number;
let browser: Browser;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);

    if (url.pathname === '/set-cookie') {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Set-Cookie': 'session=abc123; Path=/',
      });
      res.end('<html><body>Cookie set</body></html>');
      return;
    }

    if (url.pathname === '/check-cookie') {
      const cookie = req.headers.cookie || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cookie, hasSession: cookie.includes('session=abc123') }));
      return;
    }

    if (url.pathname === '/protected') {
      const cookie = req.headers.cookie || '';
      if (cookie.includes('session=abc123')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><div class="user-name">Authenticated User</div></body></html>');
      } else {
        res.writeHead(401, { 'Content-Type': 'text/html' });
        res.end('<html><body><div class="error">Not authenticated</div></body></html>');
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as any).port;
      resolve();
    });
  });

  browser = await chromium.launch({ headless: true });
}, 30000);

afterAll(async () => {
  await browser.close();
  server.close();
}, 15000);

describe('Session transfer', () => {
  it('transfers cookies from one context to another', async () => {
    // Context 1: "webview" - gets a session cookie
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto(`http://127.0.0.1:${port}/set-cookie`);

    // Extract cookies from context 1
    const cookies = await ctx1.cookies();
    expect(cookies.some((c) => c.name === 'session' && c.value === 'abc123')).toBe(true);

    await page1.close();
    await ctx1.close();

    // Context 2: "Playwright executor" - receives the cookies
    const ctx2 = await browser.newContext();
    await ctx2.addCookies(cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
    })));

    const page2 = await ctx2.newPage();

    // Verify the cookie was transferred
    const checkRes = await page2.goto(`http://127.0.0.1:${port}/check-cookie`);
    const checkData = await checkRes!.json();
    expect(checkData.hasSession).toBe(true);

    // Access a protected page using the transferred session
    await page2.goto(`http://127.0.0.1:${port}/protected`);
    const userName = await page2.textContent('.user-name');
    expect(userName).toBe('Authenticated User');

    await page2.close();
    await ctx2.close();
  });

  it('fails to access protected page without session transfer', async () => {
    // No cookies transferred
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(`http://127.0.0.1:${port}/protected`);
    const errorText = await page.textContent('.error');
    expect(errorText).toBe('Not authenticated');

    await page.close();
    await ctx.close();
  });
});
