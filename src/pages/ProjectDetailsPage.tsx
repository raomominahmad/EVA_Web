import { useState } from 'react';
import type { FormEvent } from 'react';
import { Field } from '@/components/form/Field';
import { TextArea, TextInput } from '@/components/form/controls';
import { useFocusFirstInvalid } from '@/components/form/useFocusFirstInvalid';
import { StepActions } from '@/components/workflow/StepActions';
import { StepHeader } from '@/components/workflow/StepHeader';
import { AsideSection, Workspace } from '@/components/workflow/Workspace';
import { EVA_INPUT_DEFINITIONS, EVA_INPUT_FIELDS } from '@/domain/evaTypes';
import { useAppView } from '@/app/appView';
import { useWorkflow } from '@/app/workflow/useWorkflow';
import { validateProjectDetails } from '@/domain/projectDetails';
import type { ProjectDetailsField } from '@/domain/projectDetails';
import styles from './FormPage.module.css';
import asideStyles from './WorkflowAside.module.css';

function ProjectDetailsAside() {
  return (
    <>
      <AsideSection id="next-values-heading" title="What you will enter next">
        <p className={asideStyles.text}>
          The next step asks for four amounts at the reporting date, all in one currency.
        </p>
        <dl className={asideStyles.terms}>
          {EVA_INPUT_FIELDS.map((field) => {
            const { symbol, name, definition } = EVA_INPUT_DEFINITIONS[field];
            return (
              <div key={field} className={asideStyles.term}>
                <dt className={asideStyles.symbol}>{symbol}</dt>
                <dd className={asideStyles.name}>{name}</dd>
                <dd className={asideStyles.definition}>{definition}</dd>
              </div>
            );
          })}
        </dl>
      </AsideSection>
      <AsideSection id="privacy-heading" title="Where your data goes">
        <p className={asideStyles.text}>
          What you enter is kept only in this browser tab, and project details are never sent
          anywhere. Starting a new analysis clears them.
        </p>
      </AsideSection>
    </>
  );
}

export function ProjectDetailsPage() {
  const { state, dispatch } = useWorkflow();
  const { project } = state;
  // Back to the start page. Nothing is cleared: entries stay and return with "Create a project".
  const { showLanding } = useAppView();
  const [showErrors, setShowErrors] = useState(false);
  // A partly typed date reports an empty value; `validity.badInput` reveals it.
  const [dateIncomplete, setDateIncomplete] = useState(false);
  const { containerRef, requestFocus } = useFocusFirstInvalid();

  // Errors appear after the first submission attempt and then update as the user types.
  const errors = showErrors ? validateProjectDetails(project) : {};

  if (showErrors && dateIncomplete) {
    errors.reportingDate = 'Enter a complete reporting date, or clear the field.';
  }

  function update(field: ProjectDetailsField, value: string) {
    dispatch({ type: 'UPDATE_PROJECT', changes: { [field]: value } });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (dateIncomplete || Object.keys(validateProjectDetails(project)).length > 0) {
      setShowErrors(true);
      requestFocus();
      return;
    }

    dispatch({ type: 'NEXT_STEP' });
  }

  return (
    <>
      <StepHeader
        title="Set the project context"
        lead="Start with the project this analysis describes. You will add the four measured values in the next step."
      />

      <Workspace asideLabel="About the next step" aside={<ProjectDetailsAside />}>
        <form ref={containerRef} className={styles.form} noValidate onSubmit={handleSubmit}>
          <section className={styles.section} aria-labelledby="project-details-heading">
            <div className={styles.sectionHeader}>
              <h2 id="project-details-heading" className={styles.sectionTitle}>
                Project details
              </h2>
              <p className={styles.sectionLead}>
                Only the project name is required. Fields marked Optional can stay blank.
              </p>
            </div>

            <div className={styles.grid}>
              <Field
                id="project-name"
                label="Project name"
                error={errors.name}
                className={styles.full}
              >
                {(control) => (
                  <TextInput
                    {...control}
                    name="projectName"
                    autoComplete="off"
                    aria-required="true"
                    value={project.name}
                    onChange={(event) => update('name', event.target.value)}
                  />
                )}
              </Field>

              <Field
                id="project-description"
                label="Description"
                hint="A sentence or two on scope, so the report reads well on its own."
                error={errors.description}
                optional
                className={styles.full}
              >
                {(control) => (
                  <TextArea
                    {...control}
                    name="projectDescription"
                    rows={3}
                    value={project.description}
                    onChange={(event) => update('description', event.target.value)}
                  />
                )}
              </Field>

              <Field
                id="project-manager"
                label="Project manager"
                hint="Shown in the report header and the CSV export."
                error={errors.manager}
                optional
              >
                {(control) => (
                  <TextInput
                    {...control}
                    name="projectManager"
                    autoComplete="name"
                    value={project.manager}
                    onChange={(event) => update('manager', event.target.value)}
                  />
                )}
              </Field>

              <Field
                id="reporting-date"
                label="Reporting date"
                hint="The date the values are measured at. Leave blank if not applicable."
                error={errors.reportingDate}
                optional
              >
                {(control) => (
                  <TextInput
                    {...control}
                    type="date"
                    name="reportingDate"
                    value={project.reportingDate}
                    onChange={(event) => {
                      setDateIncomplete(event.target.validity.badInput);
                      update('reportingDate', event.target.value);
                    }}
                    onBlur={(event) => setDateIncomplete(event.target.validity.badInput)}
                  />
                )}
              </Field>
            </div>
          </section>

          <StepActions
            backLabel="Back to home"
            onBack={showLanding}
            continueLabel="Continue to EVA inputs"
            submit
          />
        </form>
      </Workspace>
    </>
  );
}
