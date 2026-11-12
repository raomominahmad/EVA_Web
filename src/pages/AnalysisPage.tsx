import { ArrowRight, Download, Info, PencilLine, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BudgetComparisonChart,
  ForecastChart,
  PerformanceIndexChart,
} from '@/components/charts/AnalysisCharts';
import { InputSnapshot } from '@/components/report/InputSnapshot';
import { MetricList, ToneBadge } from '@/components/report/MetricList';
import { SignedNumber } from '@/components/report/SignedNumber';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StepActions } from '@/components/workflow/StepActions';
import { StepHeader } from '@/components/workflow/StepHeader';
import { useAppView } from '@/app/appView';
import { hasUnconfirmedChanges } from '@/app/workflow/confirmedInputs';
import { useWorkflow } from '@/app/workflow/useWorkflow';
import { createAnalysis } from '@/domain/analysis';
import type { Analysis } from '@/domain/analysis';
import { SUPPORTED_CURRENCIES } from '@/domain/currency';
import { formatCurrency, formatPercent, formatRatio } from '@/domain/formatting';
import { interpretBudgetVariance, summarizePerformance } from '@/domain/interpretations';
import {
  ASSUMPTIONS,
  BUDGET_COMPARISON_NOTE,
  BUDGET_DEFINITIONS,
} from '@/domain/metricDefinitions';
import { formatReportingDate } from '@/domain/projectDetails';
import { AiSummaryPanel } from '@/features/aiSummary/AiSummaryPanel';
import { AI_SUMMARY_NOTICE } from '@/features/aiSummary/aiSummaryMessages';
import { useAiSummary } from '@/features/aiSummary/useAiSummary';
import { buildReportCsv, reportFileName } from '@/features/export/reportCsv';
import { downloadCsv } from '@/features/export/downloadCsv';
import styles from './AnalysisPage.module.css';

function Section({
  id,
  title,
  lead,
  icon,
  className,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  icon?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={className ? `${styles.section} ${className}` : styles.section}
      aria-labelledby={`${id}-heading`}
    >
      <div className={styles.sectionHeader}>
        <h2 id={`${id}-heading`} className={styles.sectionTitle}>
          {icon}
          {title}
        </h2>
        {lead ? <p className={styles.sectionLead}>{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface NavItem {
  id: string;
  label: string;
}

/** Tracks which report section is in view, so the section bar can show where the reader is. */
function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(' ');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        // The topmost section in the reading band is the current one.
        const current = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (current) setActive(current[0]);
      },
      { rootMargin: '-96px 0px -55% 0px' },
    );
    for (const id of key.split(' ')) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/** A sticky bar of in-page links: the report's map, always in reach. */
function ReportNav({ items }: { items: readonly NavItem[] }) {
  const active = useActiveSection(items.map((item) => item.id));
  return (
    <nav className={styles.reportNav} aria-label="Report sections">
      <ul className={styles.reportNavList}>
        {items.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={styles.reportNavLink}
              aria-current={active === id ? 'location' : undefined}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PerformanceSummary({ analysis }: { analysis: Analysis }) {
  const summary = summarizePerformance(analysis);
  const { metrics, budget, currency } = analysis;
  // Headline values come from the same analysis as every other figure in the report. Only CPI and
  // SPI carry the headline status (as before); EAC and budget variance are stated with their own
  // labels so the forecast and the budget comparison stay distinct from cost efficiency.
  const items = [
    {
      title: 'Cost efficiency',
      basis: 'Based on CPI',
      symbol: 'CPI',
      value: formatRatio(metrics.cpi),
      status: summary.cost,
      text: summary.cost.text,
    },
    {
      title: 'Schedule efficiency',
      basis: 'Based on SPI',
      symbol: 'SPI',
      value: formatRatio(metrics.spi),
      status: summary.schedule,
      text: summary.schedule.text,
    },
    {
      title: 'Forecast',
      basis: 'Estimate at Completion',
      symbol: 'EAC',
      value: formatCurrency(metrics.eac, currency),
      status: null,
      text: summary.forecast,
    },
    {
      title: 'Budget versus actual',
      basis: 'BAC − AC, not CV',
      symbol: 'Budget variance',
      value: formatCurrency(budget.budgetVariance, currency),
      status: null,
      text: summary.budget,
    },
  ];
  return (
    <dl className={styles.summary}>
      {items.map(({ title, basis, symbol, value, status, text }) => (
        <div key={title} className={styles.summaryItem}>
          <dt className={styles.summaryTerm}>
            {title} <span className={styles.summaryBasis}>{basis}</span>
          </dt>
          {status ? (
            <dd className={styles.summaryStatus}>
              <ToneBadge tone={status.tone} label={status.label} />
            </dd>
          ) : null}
          <dd className={`${styles.summaryValue} numeric`}>
            <span className={styles.summarySymbol}>{symbol}</span> <SignedNumber text={value} />
          </dd>
          <dd className={styles.summaryText}>{text}</dd>
        </div>
      ))}
    </dl>
  );
}

function BudgetComparisonSection({ analysis }: { analysis: Analysis }) {
  const { budget, currency } = analysis;
  const items = [
    { key: 'estimatedCost', display: formatCurrency(budget.estimatedCost, currency) },
    { key: 'actualCost', display: formatCurrency(budget.actualCost, currency) },
    { key: 'budgetVariance', display: formatCurrency(budget.budgetVariance, currency) },
    { key: 'budgetVariancePercent', display: formatPercent(budget.budgetVariancePercent) },
  ] as const;

  return (
    <Section
      id="budget"
      title="Budget versus actual"
      lead="Spending to date compared with the total approved budget. Estimated cost is the approved budget (BAC), not the forecast EAC."
    >
      <p className={styles.callout}>
        <Info size={16} strokeWidth={2} aria-hidden="true" />
        <span>{BUDGET_COMPARISON_NOTE}</span>
      </p>
      <dl className={styles.budgetList}>
        {items.map(({ key, display }) => {
          const definition = BUDGET_DEFINITIONS[key];
          return (
            <div key={key} className={styles.budgetItem} data-item={key}>
              <dt className={styles.budgetTerm}>{definition.name}</dt>
              <dd className={`${styles.budgetValue} numeric`}>
                <SignedNumber text={display} />
              </dd>
              <dd className={styles.budgetFormula}>
                <span className="visually-hidden">Formula: </span>
                <code>{definition.formula}</code>
              </dd>
              <dd className={styles.budgetDefinition}>{definition.definition}</dd>
            </div>
          );
        })}
      </dl>
      <p className={styles.budgetInterpretation}>{interpretBudgetVariance(analysis).text}</p>
    </Section>
  );
}

export function AnalysisPage() {
  const { state, dispatch } = useWorkflow();
  const { project, confirmed, inputDraft } = state;
  const [exportStatus, setExportStatus] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const aiSummary = useAiSummary();
  const { showLanding } = useAppView();

  // The single analysis result for the report, charts, and export, recalculated from the
  // confirmed inputs only. Draft values never reach it.
  const analysis = useMemo(
    () => (confirmed ? createAnalysis(confirmed.currency, confirmed.inputs) : null),
    [confirmed],
  );

  if (!confirmed || !analysis) {
    return (
      <>
        <StepHeader
          projectName={project.name}
          title="No analysis yet"
          lead="The analysis is calculated from confirmed EVA inputs. Enter BAC, PV, EV, and AC to produce it."
        />
        <div className={styles.emptyAction}>
          <Button
            trailingIcon={<ArrowRight size={16} strokeWidth={2} />}
            onClick={() => dispatch({ type: 'GO_TO_STEP', step: 'inputs' })}
          >
            Go to EVA inputs
          </Button>
        </div>
      </>
    );
  }

  const currency = SUPPORTED_CURRENCIES.find((item) => item.code === confirmed.currency);
  const reportingDate = formatReportingDate(project.reportingDate);
  const stale = hasUnconfirmedChanges(inputDraft, confirmed);
  const editInputs = () => dispatch({ type: 'GO_TO_STEP', step: 'inputs' });
  const navItems: NavItem[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'inputs', label: 'Inputs' },
    { id: 'cost', label: 'Cost' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'progress', label: 'Completion' },
    { id: 'charts', label: 'Charts' },
    { id: 'budget', label: 'Budget' },
    ...(aiSummary.enabled ? [{ id: 'ai-summary', label: 'AI summary' }] : []),
    { id: 'assumptions', label: 'Assumptions' },
  ];

  function handleExport() {
    if (!analysis) return;
    const fileName = reportFileName(project);
    // Only a successful summary of this confirmed analysis is exported; the CSV builder checks the
    // fingerprint again. Exporting never starts a request.
    const summary = aiSummary.view.status === 'success' ? aiSummary.view.response : null;
    downloadCsv(buildReportCsv(analysis, project, summary), fileName);
    setExportStatus(`Report downloaded as ${fileName}.`);
  }

  return (
    <>
      <StepHeader
        projectName={project.name}
        title="Read the analysis"
        lead="The report turns confirmed inputs into a transparent view of cost, schedule, forecast, and completion performance."
      />

      {/* Project details as one quiet line: context, not a finding. */}
      <section id="overview" className={styles.overview} aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="visually-hidden">
          Project overview
        </h2>
        <dl className={styles.meta}>
          <div>
            <dt>Reporting date</dt>
            <dd>{reportingDate ?? 'Not provided'}</dd>
          </div>
          <div>
            <dt>Project manager</dt>
            <dd>{project.manager.trim() || 'Not provided'}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>
              {confirmed.currency}
              {currency ? ` — ${currency.name}` : null}
            </dd>
          </div>
        </dl>
        {project.description.trim() ? (
          <p className={styles.description}>{project.description}</p>
        ) : null}
      </section>

      <div className={styles.toolbar}>
        <Button
          variant="secondary"
          leadingIcon={<PencilLine size={16} strokeWidth={2} />}
          onClick={editInputs}
        >
          Edit inputs
        </Button>
        <Button
          variant="secondary"
          leadingIcon={<Download size={16} strokeWidth={2} />}
          onClick={handleExport}
        >
          Download report (CSV)
        </Button>
        <p className={styles.exportStatus} role="status">
          {exportStatus}
        </p>
      </div>

      {stale ? (
        <div className={styles.staleNotice} role="note" aria-labelledby="stale-heading">
          <Info size={18} strokeWidth={2} aria-hidden="true" className={styles.staleIcon} />
          <div>
            <p id="stale-heading" className={styles.staleTitle}>
              This report uses the previously confirmed inputs
            </p>
            <p>
              The EVA inputs have changed since this analysis was calculated. The report, charts,
              and export still show the confirmed values below. To update them, return to the inputs
              and choose “Calculate analysis”.
            </p>
            <Button
              variant="secondary"
              className={styles.staleAction}
              trailingIcon={<ArrowRight size={16} strokeWidth={2} />}
              onClick={editInputs}
            >
              Review inputs and recalculate
            </Button>
          </div>
        </div>
      ) : null}

      <ReportNav items={navItems} />

      <Section
        id="summary"
        title="Performance at a glance"
        lead="A deterministic summary of the calculated results. Headline statuses use CPI and SPI."
      >
        <PerformanceSummary analysis={analysis} />
      </Section>

      <Section
        id="inputs"
        title="Confirmed EVA inputs"
        lead="Values you entered, shown exactly as confirmed. Every calculated value below derives from these."
      >
        <InputSnapshot inputs={confirmed.inputs} currency={confirmed.currency} />
      </Section>

      {/* Cost and schedule are read together: side by side on wide screens. */}
      <div className={styles.pair}>
        <Section
          id="cost"
          title="Cost performance"
          lead="How the cost of completed work compares with its budgeted value."
        >
          <MetricList analysis={analysis} metrics={['cv', 'cpi']} />
        </Section>

        <Section
          id="schedule"
          title="Schedule performance"
          lead="How much work value has been earned compared with the plan. Measured in value, not in days."
        >
          <MetricList analysis={analysis} metrics={['sv', 'spi']} />
        </Section>
      </div>

      <Section
        id="forecast"
        title="Forecast"
        lead="Forecasts assume the current cost efficiency (CPI) continues for the remaining work. They are estimates, not certainties."
      >
        <MetricList analysis={analysis} metrics={['eac', 'etc', 'vac', 'tcpiBac', 'tcpiEac']} />
      </Section>

      <Section
        id="progress"
        title="Completion and budget use"
        lead="Value-based ratios against the total budget (BAC), shown as percentages."
      >
        <MetricList
          analysis={analysis}
          metrics={['plannedCompletion', 'earnedCompletion', 'budgetUtilization']}
        />
      </Section>

      <Section
        id="charts"
        title="Visual analysis"
        lead="Charts of the same calculated values shown above. Each chart lists its values as text."
      >
        <div className={styles.charts}>
          <BudgetComparisonChart analysis={analysis} />
          <PerformanceIndexChart analysis={analysis} />
          <ForecastChart analysis={analysis} />
        </div>
      </Section>

      <BudgetComparisonSection analysis={analysis} />

      {aiSummary.enabled ? (
        <Section
          id="ai-summary"
          title="AI-generated summary"
          lead={AI_SUMMARY_NOTICE}
          className={styles.aiSection}
          icon={
            <span className={styles.aiIcon} aria-hidden="true">
              <Sparkles size={18} strokeWidth={1.75} />
            </span>
          }
        >
          <AiSummaryPanel analysis={analysis} />
        </Section>
      ) : null}

      <Section id="assumptions" title="Assumptions and limitations">
        <ul className={styles.assumptions}>
          {ASSUMPTIONS.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </Section>

      <StepActions
        backLabel="Edit EVA inputs"
        onBack={editInputs}
        endAction={
          <Button
            variant="secondary"
            leadingIcon={<RotateCcw size={16} strokeWidth={2} />}
            onClick={() => setConfirmingReset(true)}
          >
            Start a new analysis
          </Button>
        }
      />

      {/* FR-11: the reset clears the whole workflow (RESET returns the initial state). The AI
          summary provider sees the confirmed inputs disappear, aborts any pending request, and
          ignores its late response. */}
      <ConfirmDialog
        open={confirmingReset}
        title="Start a new analysis?"
        description="This clears everything entered in this browser tab and returns to the start page."
        confirmLabel="Clear and start over"
        onCancel={() => setConfirmingReset(false)}
        onConfirm={() => {
          setConfirmingReset(false);
          dispatch({ type: 'RESET' });
          showLanding();
        }}
      >
        <p>The following will be discarded:</p>
        <ul>
          <li>Project details: name, description, manager, and reporting date</li>
          <li>The currency and the BAC, PV, EV, and AC amounts</li>
          <li>
            This report and its charts
            {aiSummary.enabled
              ? ', and any AI-generated summary (a summary still being generated is cancelled)'
              : ''}
          </li>
        </ul>
        <p>
          The copy saved for this tab is removed as well, and this cannot be undone. To keep this
          report, download the CSV first.
        </p>
      </ConfirmDialog>
    </>
  );
}
