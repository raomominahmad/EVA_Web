import { createContext } from 'react';
import type { Dispatch } from 'react';
import type { WorkflowAction, WorkflowState } from './workflowTypes';

export const WorkflowStateContext = createContext<WorkflowState | null>(null);

export const WorkflowDispatchContext = createContext<Dispatch<WorkflowAction> | null>(null);
