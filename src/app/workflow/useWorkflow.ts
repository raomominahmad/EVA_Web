import { useContext } from 'react';
import { WorkflowDispatchContext, WorkflowStateContext } from './WorkflowContext';

export function useWorkflow() {
  const state = useContext(WorkflowStateContext);
  const dispatch = useContext(WorkflowDispatchContext);

  if (!state || !dispatch) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }

  return { state, dispatch } as const;
}
