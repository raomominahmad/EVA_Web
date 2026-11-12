import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppShell } from './AppShell';
import { AppViewContext, isPristineWorkflow } from './appView';
import type { AppView, AppViewControls } from './appView';
import { useWorkflow } from './workflow/useWorkflow';
import { WorkflowProvider } from './workflow/WorkflowProvider';
import { AiSummaryProvider } from '@/features/aiSummary/AiSummaryProvider';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { EvaInputsPage } from '@/pages/EvaInputsPage';
import { LandingPage } from '@/pages/LandingPage';
import { ProjectDetailsPage } from '@/pages/ProjectDetailsPage';

function CurrentStep(): ReactNode {
  const { state } = useWorkflow();

  switch (state.step) {
    case 'project':
      return <ProjectDetailsPage />;

    case 'inputs':
      return <EvaInputsPage />;

    case 'analysis':
      return <AnalysisPage />;
  }
}

function AppContent() {
  const { state, dispatch } = useWorkflow();
  const mainRef = useRef<HTMLElement>(null);
  // A new tab (nothing entered yet) opens the landing page; a reload with saved work returns to
  // the saved step, as before.
  const [view, setView] = useState<AppView>(() =>
    isPristineWorkflow(state) ? 'landing' : 'workflow',
  );
  const location = `${view}:${state.step}`;
  const previousLocation = useRef(location);

  useEffect(() => {
    if (previousLocation.current === location) {
      return;
    }

    previousLocation.current = location;
    mainRef.current?.focus();
  }, [location]);

  const startWorkflow = useCallback(() => {
    // Always begin at project details, the first step of the workflow.
    dispatch({ type: 'GO_TO_STEP', step: 'project' });
    setView('workflow');
  }, [dispatch]);

  const showLanding = useCallback(() => setView('landing'), []);

  const controls = useMemo<AppViewControls>(
    () => ({ startWorkflow, showLanding }),
    [startWorkflow, showLanding],
  );

  return (
    <AppViewContext.Provider value={controls}>
      <AppShell
        view={view}
        currentStep={state.step}
        mainRef={mainRef}
        onStart={startWorkflow}
        contentKey={location}
      >
        {view === 'landing' ? <LandingPage onStart={startWorkflow} /> : <CurrentStep />}
      </AppShell>
    </AppViewContext.Provider>
  );
}

export function App() {
  return (
    <WorkflowProvider>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AiSummaryProvider>
        <AppContent />
      </AiSummaryProvider>
    </WorkflowProvider>
  );
}
