import { ArrowRight, Check, CircleCheck, FileUp, PencilLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Field } from '@/components/form/Field';
import { AffixInput, Select } from '@/components/form/controls';
import { useFocusFirstInvalid } from '@/components/form/useFocusFirstInvalid';
import { Button } from '@/components/ui/Button';
import { StepActions } from '@/components/workflow/StepActions';
import { StepHeader } from '@/components/workflow/StepHeader';
import { AsideSection, Workspace } from '@/components/workflow/Workspace';
import { useWorkflow } from '@/app/workflow/useWorkflow';
import type { ProjectDetails } from '@/domain/projectDetails';
import { formatReportingDate } from '@/domain/projectDetails';
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from '@/domain/currency';
import { EVA_INPUT_DEFINITIONS, EVA_INPUT_FIELDS } from '@/domain/evaTypes';
import type { EvaInputDraft } from '@/domain/evaTypes';
import { validateEvaInputs } from '@/domain/validateEvaInputs';
import { ImportPanel } from '@/features/import/ImportPanel';
import type { ImportConfirmation } from '@/features/import/ImportPanel';
import styles from './FormPage.module.css';
import asideStyles from './WorkflowAside.module.css';

const REPORT_CONTENTS = [
  'Cost and schedule indicators, each with its formula and interpretation',
  'Forecasts of the final cost, with the assumption they rest on',
  'Budget versus actual spending, kept separate from Cost Variance',
  'Three charts and a downloadable CSV report',
] as const;

function EvaInputsAside({ project, onEdit }: { project: ProjectDetails; onEdit: () => void }) {
  return (
    <>
      <AsideSection id="aside-project-heading" title="Project">
        <dl className={asideStyles.meta}>
          <div>
            <dt>Name</dt>
            <dd>{project.name}</dd>
          </div>
          <div>
            <dt>Project manager</dt>
            <dd>{project.manager.trim() || 'Not provided'}</dd>
          </div>
          <div>
            <dt>Reporting date</dt>
            <dd>{formatReportingDate(project.reportingDate) ?? 'Not provided'}</dd>
          </div>
        </dl>
        <Button
          variant="ghost"
          className={asideStyles.editAction}
          leadingIcon={<PencilLine size={16} strokeWidth={2} />}
          onClick={onEdit}
        >
          Edit project details
        </Button>
      </AsideSection>
      <AsideSection id="aside-report-heading" title="The report will include">
        <ul className={asideStyles.checks}>
          {REPORT_CONTENTS.map((item) => (
            <li key={item}>
              <Check size={16} strokeWidth={2} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </AsideSection>
    </>
  );
}

export function EvaInputsPage() {
  const { state, dispatch } = useWorkflow();
  const { inputDraft, project } = state;
  const [showErrors, setShowErrors] = useState(false);
  const { containerRef, requestFocus } = useFocusFirstInvalid();
  const [importOpen, setImportOpen] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const importHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterImport = useRef<'button' | 'form' | null>(null);

  useEffect(() => {
    if (importOpen || focusAfterImport.current === null) return;
    if (focusAfterImport.current === 'form') document.getElementById('currency')?.focus();
    else importButtonRef.current?.focus();
    focusAfterImport.current = null;
  }, [importOpen]);

  const validation = showErrors ? validateEvaInputs(inputDraft) : null;
  const errors = validation && !validation.ok ? validation.errors : {};
  const currencyCode = isSupportedCurrency(inputDraft.currency) ? inputDraft.currency : undefined;

  function update(changes: Partial<EvaInputDraft>) {
    dispatch({ type: 'UPDATE_INPUT_DRAFT', changes });
  }

  function handleImport({ values, fileName, rowNumber }: ImportConfirmation) {
    // Only the currency and the four amounts change; the user still chooses "Calculate analysis".
    update(values);
    setImportStatus(
      `Imported row ${rowNumber} from ${fileName}. Review the values, then choose “Calculate analysis”.`,
    );
    focusAfterImport.current = 'form';
    setImportOpen(false);
  }

  function closeImport() {
    focusAfterImport.current = 'button';
    setImportOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validateEvaInputs(inputDraft);

    if (!result.ok) {
      setShowErrors(true);
      requestFocus();
      return;
    }

    dispatch({
      type: 'CONFIRM_INPUTS',
      confirmed: { currency: result.currency, inputs: result.inputs },
    });
  }

  return (
    <>
      <StepHeader
        projectName={project.name}
        title="Enter the four EVA values"
        lead="Record the budget and the measured values at the reporting date. EVA calculates every indicator from these four amounts."
      />

      <Workspace
        asideLabel="Project summary"
        aside={
          <EvaInputsAside
            project={project}
            onEdit={() => dispatch({ type: 'GO_TO_STEP', step: 'project' })}
          />
        }
      >
        <div className={styles.importBar}>
          <Button
            ref={importButtonRef}
            variant="secondary"
            leadingIcon={<FileUp size={16} strokeWidth={2} />}
            aria-expanded={importOpen}
            aria-controls={importOpen ? 'import-panel' : undefined}
            onClick={() => {
              if (importOpen) {
                closeImport();
              } else {
                setImportStatus('');
                setImportOpen(true);
              }
            }}
          >
            Import from file
          </Button>
          <p className={styles.importHint}>Optional. Fill these values from a CSV or Excel file.</p>
        </div>

        <p className={styles.importStatus} role="status">
          {importStatus ? (
            <>
              <CircleCheck size={16} strokeWidth={2} aria-hidden="true" />
              <span>{importStatus}</span>
            </>
          ) : null}
        </p>

        {importOpen ? (
          <ImportPanel
            id="import-panel"
            headingRef={importHeadingRef}
            currentCurrency={inputDraft.currency}
            hasAnalysis={state.confirmed !== null}
            onConfirm={handleImport}
            onCancel={closeImport}
          />
        ) : null}

        <form ref={containerRef} className={styles.form} noValidate onSubmit={handleSubmit}>
          <section className={styles.section} aria-labelledby="currency-heading">
            <div className={styles.sectionHeader}>
              <h2 id="currency-heading" className={styles.sectionTitle}>
                Currency
              </h2>
              <p className={styles.sectionLead}>
                All four amounts must be in the same currency. EVA does not convert between
                currencies.
              </p>
            </div>

            <Field
              id="currency"
              label="Currency for all amounts"
              error={errors.currency?.message}
              className={styles.currencyField}
            >
              {(control) => (
                <Select
                  {...control}
                  name="currency"
                  aria-required="true"
                  value={inputDraft.currency}
                  onChange={(event) => update({ currency: event.target.value })}
                >
                  <option value="">Select a currency</option>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </section>

          <section className={styles.section} aria-labelledby="values-heading">
            <div className={styles.sectionHeader}>
              <h2 id="values-heading" className={styles.sectionTitle}>
                Earned value inputs
              </h2>
              <p className={styles.sectionLead}>
                All four amounts are required. Enter plain amounts with an optional decimal point.
                Thousands separators are optional, for example{' '}
                <span className="numeric">125000</span> or{' '}
                <span className="numeric">125,000.50</span>. Decimal places follow the currency, for
                example two for USD and none for JPY.
              </p>
            </div>

            <div className={styles.grid}>
              {EVA_INPUT_FIELDS.map((field) => {
                const { symbol, name, definition } = EVA_INPUT_DEFINITIONS[field];
                const unit = currencyCode ? ` Amount in ${currencyCode}.` : '';

                return (
                  <Field
                    key={field}
                    id={`eva-${field}`}
                    label={
                      <>
                        <abbr className={styles.symbol} title={name}>
                          {symbol}
                        </abbr>
                        {name}
                      </>
                    }
                    hint={`${definition}${unit}`}
                    error={errors[field]?.message}
                  >
                    {(control) => (
                      <AffixInput
                        {...control}
                        name={field}
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        aria-required="true"
                        prefix={currencyCode}
                        value={inputDraft[field]}
                        onChange={(event) => update({ [field]: event.target.value })}
                      />
                    )}
                  </Field>
                );
              })}
            </div>

            <div className={styles.rules}>
              <p className={styles.rulesTitle}>Baseline assumptions</p>
              <ul>
                <li>BAC must be greater than zero.</li>
                <li>PV and EV cannot exceed BAC.</li>
                <li>EV may exceed PV when work is ahead of plan, and AC may exceed BAC.</li>
                <li>PV or AC may be zero; ratios that would divide by zero are reported as N/A.</li>
              </ul>
            </div>
          </section>

          <StepActions
            backLabel="Back to project details"
            onBack={() => dispatch({ type: 'PREVIOUS_STEP' })}
            continueLabel="Calculate analysis"
            submit
          />
        </form>

        {state.confirmed ? (
          <div className={styles.lastAnalysis}>
            <p>
              A calculated analysis already exists. It keeps its confirmed values until you choose
              “Calculate analysis”.
            </p>
            <Button
              variant="ghost"
              trailingIcon={<ArrowRight size={16} strokeWidth={2} />}
              onClick={() => dispatch({ type: 'GO_TO_STEP', step: 'analysis' })}
            >
              View last analysis
            </Button>
          </div>
        ) : null}
      </Workspace>
    </>
  );
}
