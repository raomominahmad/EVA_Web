import { describe, expect, it } from 'vitest';
import {
  EMPTY_INPUT_DRAFT,
  initialWorkflowState,
  resolveReachableStep,
  workflowReducer,
} from './workflowReducer';
import { getAdjacentStep, getStepIndex, WORKFLOW_STEPS } from './workflowTypes';
import type { ConfirmedInputs, WorkflowState } from './workflowTypes';

const CONFIRMED: ConfirmedInputs = {
  currency: 'USD',
  inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 },
};

const namedState: WorkflowState = {
  ...initialWorkflowState,
  project: { ...initialWorkflowState.project, name: 'Billing platform' },
};

const confirmedState: WorkflowState = { ...namedState, confirmed: CONFIRMED };

describe('workflowReducer', () => {
  it('starts at the project details step with empty data', () => {
    expect(initialWorkflowState).toEqual({
      step: 'project',
      project: { name: '', description: '', manager: '', reportingDate: '' },
      inputDraft: EMPTY_INPUT_DRAFT,
      confirmed: null,
    });
  });

  it('does not leave project details until the project name is valid', () => {
    expect(workflowReducer(initialWorkflowState, { type: 'NEXT_STEP' }).step).toBe('project');
    expect(workflowReducer(namedState, { type: 'NEXT_STEP' }).step).toBe('inputs');
  });

  it('does not reach the analysis without confirmed inputs', () => {
    const inputs = { ...namedState, step: 'inputs' } as const;

    expect(workflowReducer(inputs, { type: 'NEXT_STEP' }).step).toBe('inputs');
    expect(workflowReducer(inputs, { type: 'GO_TO_STEP', step: 'analysis' }).step).toBe('inputs');
  });

  it('moves forward and backward within the workflow bounds', () => {
    const analysis = workflowReducer({ ...confirmedState, step: 'inputs' }, { type: 'NEXT_STEP' });
    const stillAnalysis = workflowReducer(analysis, { type: 'NEXT_STEP' });
    const inputs = workflowReducer(analysis, { type: 'PREVIOUS_STEP' });
    const project = workflowReducer(inputs, { type: 'PREVIOUS_STEP' });
    const stillProject = workflowReducer(project, { type: 'PREVIOUS_STEP' });

    expect(analysis.step).toBe('analysis');
    expect(stillAnalysis.step).toBe('analysis');
    expect(inputs.step).toBe('inputs');
    expect(project.step).toBe('project');
    expect(stillProject.step).toBe('project');
  });

  it('updates project details and the input draft without touching other data', () => {
    const withProject = workflowReducer(confirmedState, {
      type: 'UPDATE_PROJECT',
      changes: { manager: 'A. Rahman' },
    });
    const withDraft = workflowReducer(withProject, {
      type: 'UPDATE_INPUT_DRAFT',
      changes: { bac: '1,000' },
    });

    expect(withDraft.project).toEqual({ ...namedState.project, manager: 'A. Rahman' });
    expect(withDraft.inputDraft).toEqual({ ...EMPTY_INPUT_DRAFT, bac: '1,000' });
    expect(withDraft.confirmed).toBe(CONFIRMED);
  });

  it('keeps raw draft text exactly as typed', () => {
    const state = workflowReducer(namedState, {
      type: 'UPDATE_INPUT_DRAFT',
      changes: { pv: ' 1,234.50 ' },
    });

    expect(state.inputDraft.pv).toBe(' 1,234.50 ');
  });

  it('confirms inputs and opens the analysis', () => {
    const state = workflowReducer(
      { ...namedState, step: 'inputs' },
      { type: 'CONFIRM_INPUTS', confirmed: CONFIRMED },
    );

    expect(state.step).toBe('analysis');
    expect(state.confirmed).toEqual(CONFIRMED);
  });

  it('resets every value to the initial state', () => {
    expect(workflowReducer({ ...confirmedState, step: 'analysis' }, { type: 'RESET' })).toEqual(
      initialWorkflowState,
    );
  });
});

describe('resolveReachableStep', () => {
  it('falls back to the furthest step the data supports', () => {
    expect(resolveReachableStep(initialWorkflowState, 'analysis')).toBe('project');
    expect(resolveReachableStep(namedState, 'analysis')).toBe('inputs');
    expect(resolveReachableStep(confirmedState, 'analysis')).toBe('analysis');
    expect(resolveReachableStep(confirmedState, 'project')).toBe('project');
  });
});

describe('workflow step metadata', () => {
  it('defines the three ordered workflow steps', () => {
    expect(WORKFLOW_STEPS.map((step) => step.id)).toEqual(['project', 'inputs', 'analysis']);
  });

  it('resolves step indexes', () => {
    expect(getStepIndex('project')).toBe(0);
    expect(getStepIndex('inputs')).toBe(1);
    expect(getStepIndex('analysis')).toBe(2);
  });

  it('returns adjacent steps without moving beyond the workflow bounds', () => {
    expect(getAdjacentStep('project', 1)).toBe('inputs');
    expect(getAdjacentStep('inputs', 1)).toBe('analysis');
    expect(getAdjacentStep('analysis', 1)).toBe('analysis');
    expect(getAdjacentStep('analysis', -1)).toBe('inputs');
    expect(getAdjacentStep('inputs', -1)).toBe('project');
    expect(getAdjacentStep('project', -1)).toBe('project');
  });
});
