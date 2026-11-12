import { useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import { WorkflowDispatchContext, WorkflowStateContext } from './WorkflowContext';
import { workflowReducer } from './workflowReducer';
import { loadWorkflowState, saveWorkflowState } from './workflowStorage';

interface WorkflowProviderProps {
  children: ReactNode;
}

export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const [state, dispatch] = useReducer(workflowReducer, undefined, loadWorkflowState);

  useEffect(() => {
    saveWorkflowState(state);
  }, [state]);

  return (
    <WorkflowStateContext.Provider value={state}>
      <WorkflowDispatchContext.Provider value={dispatch}>
        {children}
      </WorkflowDispatchContext.Provider>
    </WorkflowStateContext.Provider>
  );
}
