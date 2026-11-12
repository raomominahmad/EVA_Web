import { isSupportedCurrency } from '@/domain/currency';
import { EVA_INPUT_FIELDS } from '@/domain/evaTypes';
import type { EvaInputDraft } from '@/domain/evaTypes';
import type { ProjectDetails } from '@/domain/projectDetails';
import { isValidEvaInputValues } from '@/domain/validateEvaInputs';
import { initialWorkflowState, resolveReachableStep } from './workflowReducer';
import { WORKFLOW_STEPS } from './workflowTypes';
import type { ConfirmedInputs, WorkflowState, WorkflowStep } from './workflowTypes';

export const WORKFLOW_STORAGE_VERSION = 1;
export const WORKFLOW_STORAGE_KEY = `eva.workflow.v${WORKFLOW_STORAGE_VERSION}`;

/**
 * Only user-entered data and the confirmed inputs are stored. Calculated metrics are never
 * persisted; the analysis is recalculated from `confirmed`.
 */
interface StoredWorkflow {
  version: typeof WORKFLOW_STORAGE_VERSION;
  step: WorkflowStep;
  project: ProjectDetails;
  inputDraft: EvaInputDraft;
  confirmed: ConfirmedInputs | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringFields<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, string> {
  return isRecord(value) && keys.every((key) => typeof value[key] === 'string');
}

function isWorkflowStep(value: unknown): value is WorkflowStep {
  return WORKFLOW_STEPS.some((step) => step.id === value);
}

const PROJECT_KEYS = ['name', 'description', 'manager', 'reportingDate'] as const;
const DRAFT_KEYS = ['currency', ...EVA_INPUT_FIELDS] as const;

function parseConfirmed(value: unknown): ConfirmedInputs | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isRecord(value) || typeof value.currency !== 'string') {
    return undefined;
  }

  const { currency, inputs } = value;

  if (!isSupportedCurrency(currency) || !isRecord(inputs)) {
    return undefined;
  }

  const values = { bac: inputs.bac, pv: inputs.pv, ev: inputs.ev, ac: inputs.ac };

  return isValidEvaInputValues(values, currency) ? { currency, inputs: values } : undefined;
}

/** Parses stored data; returns `null` for anything malformed or from another version. */
export function parseStoredWorkflow(raw: string | null): WorkflowState | null {
  if (raw === null) {
    return null;
  }

  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(data) || data.version !== WORKFLOW_STORAGE_VERSION) {
    return null;
  }

  const { step, project, inputDraft } = data;
  const confirmed = parseConfirmed(data.confirmed);

  if (
    !isWorkflowStep(step) ||
    !hasStringFields(project, PROJECT_KEYS) ||
    !hasStringFields(inputDraft, DRAFT_KEYS) ||
    confirmed === undefined
  ) {
    return null;
  }

  const state: WorkflowState = {
    step: 'project',
    project: {
      name: project.name,
      description: project.description,
      manager: project.manager,
      reportingDate: project.reportingDate,
    },
    inputDraft: {
      currency: inputDraft.currency,
      bac: inputDraft.bac,
      pv: inputDraft.pv,
      ev: inputDraft.ev,
      ac: inputDraft.ac,
    },
    confirmed,
  };

  return { ...state, step: resolveReachableStep(state, step) };
}

export function serializeWorkflow(state: WorkflowState): string {
  const stored: StoredWorkflow = {
    version: WORKFLOW_STORAGE_VERSION,
    step: state.step,
    project: state.project,
    inputDraft: state.inputDraft,
    confirmed: state.confirmed,
  };

  return JSON.stringify(stored);
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Restores the saved workflow, or the initial state when storage is absent or unusable. */
export function loadWorkflowState(): WorkflowState {
  try {
    return (
      parseStoredWorkflow(getStorage()?.getItem(WORKFLOW_STORAGE_KEY) ?? null) ??
      initialWorkflowState
    );
  } catch {
    return initialWorkflowState;
  }
}

/** Saves the workflow. Storage failures (quota, private mode) are ignored. */
export function saveWorkflowState(state: WorkflowState): void {
  try {
    getStorage()?.setItem(WORKFLOW_STORAGE_KEY, serializeWorkflow(state));
  } catch {
    // Persistence is a convenience; the in-memory state remains the source of truth.
  }
}
