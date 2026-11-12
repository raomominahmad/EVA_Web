import { EMPTY_PROJECT_DETAILS, validateProjectDetails } from '@/domain/projectDetails';
import type { EvaInputDraft } from '@/domain/evaTypes';
import { getAdjacentStep } from './workflowTypes';
import type { WorkflowAction, WorkflowState, WorkflowStep } from './workflowTypes';

export const EMPTY_INPUT_DRAFT: EvaInputDraft = {
  currency: '',
  bac: '',
  pv: '',
  ev: '',
  ac: '',
};

export const initialWorkflowState: WorkflowState = {
  step: 'project',
  project: EMPTY_PROJECT_DETAILS,
  inputDraft: EMPTY_INPUT_DRAFT,
  confirmed: null,
};

/**
 * Returns the furthest step at or before `requested` that the state supports: EVA inputs need
 * valid project details, and the analysis also needs confirmed inputs.
 */
export function resolveReachableStep(state: WorkflowState, requested: WorkflowStep): WorkflowStep {
  if (requested === 'project') {
    return 'project';
  }

  if (Object.keys(validateProjectDetails(state.project)).length > 0) {
    return 'project';
  }

  if (requested === 'analysis' && state.confirmed === null) {
    return 'inputs';
  }

  return requested;
}

function withStep(state: WorkflowState, requested: WorkflowStep): WorkflowState {
  const step = resolveReachableStep(state, requested);

  return step === state.step ? state : { ...state, step };
}

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'GO_TO_STEP':
      return withStep(state, action.step);

    case 'NEXT_STEP':
      return withStep(state, getAdjacentStep(state.step, 1));

    case 'PREVIOUS_STEP':
      return withStep(state, getAdjacentStep(state.step, -1));

    case 'UPDATE_PROJECT':
      return { ...state, project: { ...state.project, ...action.changes } };

    case 'UPDATE_INPUT_DRAFT':
      return { ...state, inputDraft: { ...state.inputDraft, ...action.changes } };

    case 'CONFIRM_INPUTS':
      return withStep({ ...state, confirmed: action.confirmed }, 'analysis');

    case 'RESET':
      return initialWorkflowState;

    default:
      return state;
  }
}
