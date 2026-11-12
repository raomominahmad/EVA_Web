import type { CurrencyCode } from '@/domain/currency';
import type { EvaInputDraft, EvaInputs } from '@/domain/evaTypes';
import type { ProjectDetails } from '@/domain/projectDetails';

export const WORKFLOW_STEPS = [
  {
    id: 'project',
    label: 'Project details',
    shortLabel: 'Project',
  },
  {
    id: 'inputs',
    label: 'EVA inputs',
    shortLabel: 'Inputs',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    shortLabel: 'Analysis',
  },
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number]['id'];

/** Inputs that passed validation when the user last chose to calculate the analysis. */
export interface ConfirmedInputs {
  currency: CurrencyCode;
  inputs: EvaInputs;
}

export interface WorkflowState {
  step: WorkflowStep;
  project: ProjectDetails;
  /** Raw form text, preserved exactly as typed while the user edits. */
  inputDraft: EvaInputDraft;
  /** The analysis is always recalculated from these; `null` until the first calculation. */
  confirmed: ConfirmedInputs | null;
}

export type WorkflowAction =
  | { type: 'GO_TO_STEP'; step: WorkflowStep }
  | { type: 'NEXT_STEP' }
  | { type: 'PREVIOUS_STEP' }
  | { type: 'UPDATE_PROJECT'; changes: Partial<ProjectDetails> }
  | { type: 'UPDATE_INPUT_DRAFT'; changes: Partial<EvaInputDraft> }
  | { type: 'CONFIRM_INPUTS'; confirmed: ConfirmedInputs }
  | { type: 'RESET' };

export function getStepIndex(step: WorkflowStep): number {
  return WORKFLOW_STEPS.findIndex((item) => item.id === step);
}

export function getAdjacentStep(step: WorkflowStep, direction: 1 | -1): WorkflowStep {
  const currentIndex = getStepIndex(step);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), WORKFLOW_STEPS.length - 1);
  const nextStep = WORKFLOW_STEPS[nextIndex];

  return nextStep ? nextStep.id : step;
}
