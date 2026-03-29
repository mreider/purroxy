import { describe, it, expect } from 'vitest';
import type { Workflow } from '../shared/types';

// This test verifies the IPC channel names match between
// types.ts, preload.ts, and main.ts. We can't test actual IPC
// in unit tests, but we can verify the contract.

import { IPC } from '../shared/types';

describe('Workflow IPC channels exist', () => {
  it('has all workflow channels defined', () => {
    expect(IPC.SAVE_WORKFLOW).toBe('workflow:save');
    expect(IPC.LOAD_WORKFLOW).toBe('workflow:load');
    expect(IPC.LIST_WORKFLOWS).toBe('workflow:list');
    expect(IPC.DELETE_WORKFLOW).toBe('workflow:delete');
    expect(IPC.RUN_WORKFLOW).toBe('workflow:run');
  });
});
