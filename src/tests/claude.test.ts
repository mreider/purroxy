import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapturedExchange } from '../shared/types';

// Mock the Anthropic SDK since we don't want to hit the real API in unit tests
const mockResponse = {
  content: [
    {
      type: 'text',
      text: 'I found 2 API endpoints in the captured traffic.',
    },
    {
      type: 'tool_use',
      id: 'tool_1',
      name: 'define_endpoints',
      input: {
        site_name: 'Test App',
        site_description: 'A test application',
        endpoints: [
          {
            name: 'listUsers',
            description: 'Get a list of users',
                    method: 'GET',
                    url_pattern: 'https://api.test.com/v1/users',
                    headers: { Authorization: 'Bearer {token}' },
                    parameters: [
                      {
                        name: 'page',
                        location: 'query',
                        type: 'number',
                        required: false,
                        description: 'Page number',
                        example_value: '1',
                      },
                    ],
                    example_response: '{"users": []}',
                  },
                  {
                    name: 'createUser',
                    description: 'Create a new user',
                    method: 'POST',
                    url_pattern: 'https://api.test.com/v1/users',
                    headers: { Authorization: 'Bearer {token}' },
                    parameters: [
                      {
                        name: 'email',
                        location: 'body',
                        type: 'string',
                        required: true,
                        description: 'User email',
                        example_value: 'test@example.com',
                      },
                    ],
                    example_body: '{"email": "test@example.com"}',
                    example_response: '{"id": "123", "email": "test@example.com"}',
                  },
                ],
              },
            },
          ],
        };

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages: { create: ReturnType<typeof vi.fn> };
    constructor() {
      this.messages = {
        create: vi.fn().mockResolvedValue(mockResponse),
      };
    }
  }
  return { default: MockAnthropic };
});

// Import after mocking
import { ClaudeAnalyzer } from '../main/claude';

function makeSampleExchanges(): CapturedExchange[] {
  return [
    {
      request: {
        id: '1',
        timestamp: Date.now(),
        method: 'GET',
        url: 'https://api.test.com/v1/users?page=1',
        headers: {
          Authorization: 'Bearer sk-test-token',
          'Content-Type': 'application/json',
        },
        resourceType: 'XHR',
      },
      response: {
        requestId: '1',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        mimeType: 'application/json',
        body: '{"users": [{"id": "1", "email": "user@test.com"}]}',
      },
    },
    {
      request: {
        id: '2',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.test.com/v1/users',
        headers: {
          Authorization: 'Bearer sk-test-token',
          'Content-Type': 'application/json',
        },
        postData: '{"email": "new@test.com"}',
        resourceType: 'XHR',
      },
      response: {
        requestId: '2',
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json' },
        mimeType: 'application/json',
        body: '{"id": "2", "email": "new@test.com"}',
      },
    },
  ];
}

describe('ClaudeAnalyzer', () => {
  let analyzer: ClaudeAnalyzer;

  beforeEach(() => {
    analyzer = new ClaudeAnalyzer();
  });

  it('requires API key to be set before analysis', async () => {
    expect(analyzer.hasApiKey()).toBe(false);
    await expect(analyzer.analyzeTraffic([])).rejects.toThrow('Anthropic API key not set');
  });

  it('reports hasApiKey correctly after setting', () => {
    analyzer.setApiKey('sk-ant-test-key');
    expect(analyzer.hasApiKey()).toBe(true);
  });

  it('analyzes traffic and returns structured endpoints', async () => {
    analyzer.setApiKey('sk-ant-test-key');
    const exchanges = makeSampleExchanges();

    const result = await analyzer.analyzeTraffic(exchanges);

    expect(result.siteName).toBe('Test App');
    expect(result.siteDescription).toBe('A test application');
    expect(result.endpoints).toHaveLength(2);
    expect(result.message).toContain('2 API endpoints');
  });

  it('parses endpoint structure correctly', async () => {
    analyzer.setApiKey('sk-ant-test-key');
    const exchanges = makeSampleExchanges();

    const result = await analyzer.analyzeTraffic(exchanges);
    const listEndpoint = result.endpoints.find((e) => e.name === 'listUsers');
    const createEndpoint = result.endpoints.find((e) => e.name === 'createUser');

    expect(listEndpoint).toBeDefined();
    expect(listEndpoint!.method).toBe('GET');
    expect(listEndpoint!.urlPattern).toBe('https://api.test.com/v1/users');
    expect(listEndpoint!.parameters).toHaveLength(1);
    expect(listEndpoint!.parameters[0].name).toBe('page');
    expect(listEndpoint!.parameters[0].location).toBe('query');

    expect(createEndpoint).toBeDefined();
    expect(createEndpoint!.method).toBe('POST');
    expect(createEndpoint!.parameters).toHaveLength(1);
    expect(createEndpoint!.parameters[0].name).toBe('email');
    expect(createEndpoint!.parameters[0].required).toBe(true);
  });

  it('generates unique IDs for endpoints', async () => {
    analyzer.setApiKey('sk-ant-test-key');
    const result = await analyzer.analyzeTraffic(makeSampleExchanges());

    const ids = result.endpoints.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('calls stream callback when provided', async () => {
    analyzer.setApiKey('sk-ant-test-key');
    const streamedText: string[] = [];

    await analyzer.analyzeTraffic(makeSampleExchanges(), undefined, (text) => {
      streamedText.push(text);
    });

    expect(streamedText.length).toBeGreaterThan(0);
  });

  it('resets conversation history', async () => {
    analyzer.setApiKey('sk-ant-test-key');
    await analyzer.analyzeTraffic(makeSampleExchanges());

    // Should not throw
    analyzer.resetConversation();
    const result = await analyzer.analyzeTraffic(makeSampleExchanges());
    expect(result.endpoints).toHaveLength(2);
  });
});
