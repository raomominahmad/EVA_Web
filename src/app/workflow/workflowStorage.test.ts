import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialWorkflowState, workflowReducer } from './workflowReducer';
import {
  loadWorkflowState,
  parseStoredWorkflow,
  saveWorkflowState,
  serializeWorkflow,
  WORKFLOW_STORAGE_KEY,
} from './workflowStorage';
import type { WorkflowState } from './workflowTypes';

const STATE: WorkflowState = {
  step: 'analysis',
  project: {
    name: 'Billing "core", phase 2',
    description: 'Line one\nline two',
    manager: 'A. Rahman',
    reportingDate: '2026-03-31',
  },
  inputDraft: { currency: 'USD', bac: '100,000', pv: '40000', ev: '35,000.00', ac: '42000' },
  confirmed: { currency: 'USD', inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 } },
};

function storedObject(): Record<string, unknown> {
  return JSON.parse(serializeWorkflow(STATE)) as Record<string, unknown>;
}

function stored(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...storedObject(), ...overrides });
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe('workflow storage', () => {
  it('overwrites the saved workflow with the empty state after a reset (FR-11)', () => {
    saveWorkflowState(STATE);
    saveWorkflowState(workflowReducer(STATE, { type: 'RESET' }));

    const saved = window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY) ?? '';
    expect(saved).not.toMatch(/Billing|Rahman|2026-03-31|100000|USD/);
    expect(parseStoredWorkflow(saved)).toEqual(initialWorkflowState);
    expect(loadWorkflowState()).toEqual(initialWorkflowState);
  });

  it('uses a versioned key', () => {
    expect(WORKFLOW_STORAGE_KEY).toBe('eva.workflow.v1');
  });

  it('round-trips user data and confirmed inputs', () => {
    expect(parseStoredWorkflow(serializeWorkflow(STATE))).toEqual(STATE);
  });

  it('never stores calculated metrics', () => {
    expect(Object.keys(storedObject())).toEqual([
      'version',
      'step',
      'project',
      'inputDraft',
      'confirmed',
    ]);
  });

  it('treats missing, malformed, and wrong-version data as absent', () => {
    expect(parseStoredWorkflow(null)).toBeNull();
    expect(parseStoredWorkflow('{not json')).toBeNull();
    expect(parseStoredWorkflow('[]')).toBeNull();
    expect(parseStoredWorkflow(stored({ version: 2 }))).toBeNull();
    expect(parseStoredWorkflow(stored({ step: 'report' }))).toBeNull();
    expect(parseStoredWorkflow(stored({ project: { name: 'Only a name' } }))).toBeNull();
    expect(
      parseStoredWorkflow(stored({ inputDraft: { ...STATE.inputDraft, bac: 100 } })),
    ).toBeNull();
  });

  it('rejects confirmed inputs that break the validation rules', () => {
    const invalidInputs = [
      { bac: 0, pv: 0, ev: 0, ac: 0 },
      { bac: 100, pv: 101, ev: 0, ac: 0 },
      { bac: 100, pv: 0, ev: 0, ac: -1 },
      { bac: 100, pv: 0, ev: 0, ac: null },
      // D4: more decimal places than USD allows, and a floating-point remainder.
      { bac: 100, pv: 0, ev: 0, ac: 0.005 },
      { bac: 100, pv: 0.1 + 0.2, ev: 0, ac: 0 },
    ];

    for (const inputs of invalidInputs) {
      expect(parseStoredWorkflow(stored({ confirmed: { currency: 'USD', inputs } }))).toBeNull();
    }

    expect(
      parseStoredWorkflow(
        stored({ confirmed: { currency: 'XYZ', inputs: STATE.confirmed?.inputs } }),
      ),
    ).toBeNull();
  });

  it('moves a restored step back to one the data supports', () => {
    expect(parseStoredWorkflow(stored({ confirmed: null }))?.step).toBe('inputs');
    expect(parseStoredWorkflow(stored({ project: { ...STATE.project, name: '' } }))?.step).toBe(
      'project',
    );
  });

  it('saves to and loads from sessionStorage', () => {
    saveWorkflowState(STATE);

    expect(window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY)).not.toBeNull();
    expect(loadWorkflowState()).toEqual(STATE);
  });

  it('falls back to the initial state when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveWorkflowState(STATE)).not.toThrow();
    expect(loadWorkflowState()).toEqual(initialWorkflowState);
  });
});
