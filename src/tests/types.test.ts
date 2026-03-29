import { describe, it, expect } from 'vitest';
import { IPC } from '../shared/types';

describe('IPC channel constants', () => {
  it('has all required channels', () => {
    expect(IPC.ATTACH_CAPTURE).toBe('capture:attach');
    expect(IPC.DETACH_CAPTURE).toBe('capture:detach');
    expect(IPC.CAPTURE_EXCHANGE).toBe('capture:exchange');
    expect(IPC.ANALYZE_WITH_CLAUDE).toBe('claude:analyze');
    expect(IPC.CLAUDE_STREAM).toBe('claude:stream');
    expect(IPC.EXECUTE_ENDPOINT).toBe('endpoint:execute');
    expect(IPC.SET_API_KEY).toBe('settings:set-api-key');
    expect(IPC.GET_API_KEY).toBe('settings:get-api-key');
  });

  it('has unique channel names', () => {
    const values = Object.values(IPC);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
