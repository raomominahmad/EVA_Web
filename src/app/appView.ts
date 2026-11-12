import { createContext, useContext } from 'react';
import { EMPTY_PROJECT_DETAILS } from '@/domain/projectDetails';
import { EMPTY_INPUT_DRAFT } from './workflow/workflowReducer';
import type { WorkflowState } from './workflow/workflowTypes';

/**
 * Which top-level view is shown: the landing page or the three-step workflow. This is view state
 * only. It is not part of the workflow reducer and is never stored, so the saved workflow format
 * and its refresh behaviour (FR-10) are unchanged.
 */
export type AppView = 'landing' | 'workflow';

export interface AppViewControls {
  /** Leaves the landing page for the first workflow step. */
  startWorkflow: () => void;
  /** Shows the landing page. Used after a confirmed reset. */
  showLanding: () => void;
}

export const AppViewContext = createContext<AppViewControls | null>(null);

export function useAppView(): AppViewControls {
  const controls = useContext(AppViewContext);

  if (!controls) {
    throw new Error('useAppView must be used inside the App component.');
  }

  return controls;
}

/**
 * True when nothing has been entered yet: the state a new tab starts with. A fresh visit (or a
 * reload before anything was typed) opens the landing page; a reload with work in progress
 * returns to the saved step.
 */
export function isPristineWorkflow(state: WorkflowState): boolean {
  const projectEmpty = (Object.keys(EMPTY_PROJECT_DETAILS) as (keyof typeof state.project)[]).every(
    (key) => state.project[key] === EMPTY_PROJECT_DETAILS[key],
  );
  const draftEmpty = (Object.keys(EMPTY_INPUT_DRAFT) as (keyof typeof state.inputDraft)[]).every(
    (key) => state.inputDraft[key] === EMPTY_INPUT_DRAFT[key],
  );

  return state.step === 'project' && projectEmpty && draftEmpty && state.confirmed === null;
}
