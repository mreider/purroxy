import { describe, it, expect } from 'vitest';
import { filterApiTraffic } from '../main/capture';
import { CapturedExchange } from '../shared/types';

function makeExchange(overrides: {
  method?: string;
  url?: string;
  resourceType?: string;
  mimeType?: string;
  status?: number;
}): CapturedExchange {
  return {
    request: {
      id: 'test-' + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      method: overrides.method || 'GET',
      url: overrides.url || 'https://example.com/api/data',
      headers: { 'Content-Type': 'application/json' },
      resourceType: overrides.resourceType || 'XHR',
    },
    response: {
      requestId: 'test',
      status: overrides.status || 200,
      statusText: 'OK',
      headers: { 'content-type': overrides.mimeType || 'application/json' },
      mimeType: overrides.mimeType || 'application/json',
      body: '{"data": "test"}',
    },
  };
}

describe('filterApiTraffic', () => {
  it('keeps XHR/Fetch JSON requests', () => {
    const exchanges = [
      makeExchange({ resourceType: 'XHR', mimeType: 'application/json' }),
      makeExchange({ resourceType: 'Fetch', mimeType: 'application/json' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(2);
  });

  it('filters out static image assets', () => {
    const exchanges = [
      makeExchange({ resourceType: 'Image', url: 'https://example.com/logo.png' }),
      makeExchange({ resourceType: 'XHR', url: 'https://example.com/api/data' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].request.url).toContain('/api/data');
  });

  it('filters out font files', () => {
    const exchanges = [
      makeExchange({ resourceType: 'Font', url: 'https://example.com/font.woff2' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(0);
  });

  it('filters out CSS files', () => {
    const exchanges = [
      makeExchange({ resourceType: 'Stylesheet', url: 'https://example.com/styles.css' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(0);
  });

  it('keeps non-GET requests regardless of type', () => {
    const exchanges = [
      makeExchange({ method: 'POST', resourceType: 'Other', mimeType: 'text/html' }),
      makeExchange({ method: 'PUT', resourceType: 'Other', mimeType: 'text/html' }),
      makeExchange({ method: 'DELETE', resourceType: 'Other', mimeType: 'text/html' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(3);
  });

  it('keeps XML responses', () => {
    const exchanges = [
      makeExchange({ resourceType: 'Other', mimeType: 'application/xml' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(1);
  });

  it('filters out static asset URLs even with generic resource type', () => {
    const exchanges = [
      makeExchange({ resourceType: 'Other', url: 'https://example.com/image.jpg', mimeType: 'text/html' }),
      makeExchange({ resourceType: 'Other', url: 'https://example.com/font.woff2', mimeType: 'text/html' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterApiTraffic([])).toHaveLength(0);
  });

  it('handles mixed traffic correctly', () => {
    const exchanges = [
      makeExchange({ resourceType: 'XHR', url: 'https://app.com/api/users', mimeType: 'application/json' }),
      makeExchange({ resourceType: 'Image', url: 'https://app.com/avatar.png' }),
      makeExchange({ resourceType: 'Stylesheet', url: 'https://app.com/main.css' }),
      makeExchange({ method: 'POST', resourceType: 'Fetch', url: 'https://app.com/api/login', mimeType: 'application/json' }),
      makeExchange({ resourceType: 'Font', url: 'https://app.com/inter.woff2' }),
      makeExchange({ resourceType: 'Other', url: 'https://app.com/api/config', mimeType: 'application/json' }),
    ];
    const filtered = filterApiTraffic(exchanges);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((e) => e.request.url)).toEqual([
      'https://app.com/api/users',
      'https://app.com/api/login',
      'https://app.com/api/config',
    ]);
  });
});
