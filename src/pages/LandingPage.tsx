import {
  Activity,
  ArrowDown,
  Calculator,
  Check,
  Download,
  FileSpreadsheet,
  Gauge,
  Lock,
  MessageSquareText,
  Percent,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button, ButtonLink } from '@/components/ui/Button';
import { BUDGET_DEFINITIONS, METRIC_DEFINITIONS } from '@/domain/metricDefinitions';
import { SUPPORTED_CURRENCIES } from '@/domain/currency';
import { ReportPreview } from '@/features/landing/ReportPreview';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  /** Opens the first workflow step, project details. */
  onStart: () => void;
}

interface Capability {
  title: string;
  icon: LucideIcon;
  text: string;
  formulas: readonly string[];
}

const M = METRIC_DEFINITIONS;

// Only what the application does. Every formula is read from the definitions the report uses.
const CAPABILITIES: readonly Capability[] = [
  {
    title: 'Four essential EVA inputs',
    icon: Calculator,
    text: `Budget at Completion (BAC), Planned Value (PV), Earned Value (EV), and Actual Cost (AC), in one of ${SUPPORTED_CURRENCIES.length} currencies. Every value is checked before anything is calculated.`,
    formulas: [],
  },
  {
    title: 'Cost performance analysis',
    icon: Gauge,
    text: 'Whether completed work cost more or less than its budgeted value, as an amount and as an efficiency ratio.',
    formulas: [M.cv.formula, M.cpi.formula],
  },
  {
    title: 'Schedule performance analysis',
    icon: Activity,
    text: 'How much work value has been earned against the plan, measured in value rather than days.',
    formulas: [M.sv.formula, M.spi.formula],
  },
  {
    title: 'Project cost forecasting',
    icon: TrendingUp,
    text: 'The expected final cost, the cost still to come, and the efficiency needed to finish. Each forecast states its assumption.',
    formulas: [M.eac.formula, M.etc.formula, M.vac.formula],
  },
  {
    title: 'Completion and budget use',
    icon: Percent,
    text: 'Planned and earned completion and budget used, as value-based percentages, plus spending against the total budget.',
    formulas: [BUDGET_DEFINITIONS.budgetVariance.formula],
  },
  {
    title: 'CSV and XLSX import',
    icon: FileSpreadsheet,
    text: 'Fill the four values from one row of a CSV or XLSX file. The file is read and checked in your browser and never uploaded.',
    formulas: [],
  },
  {
    title: 'Downloadable CSV report',
    icon: Download,
    text: 'Project details, inputs, every metric with its definition and interpretation, and the assumptions, ready for a spreadsheet.',
    formulas: [],
  },
  {
    title: 'Optional AI summary',
    icon: MessageSquareText,
    text: 'Where the local AI backend is running, a plain-language reading of the calculated results, labelled as AI-generated.',
    formulas: [],
  },
];

const STEPS = [
  {
    title: 'Enter project details',
    text: 'Name the project. A description, the project manager, and the reporting date are optional.',
  },
  {
    title: 'Provide BAC, PV, EV, and AC',
    text: 'Choose the currency and type the four values, or import them from a CSV or XLSX file.',
  },
  {
    title: 'Generate the analysis',
    text: 'EVA calculates every indicator, with its formula, a plain interpretation, and three charts.',
  },
  {
    title: 'Review and download',
    text: 'Read the report, add the optional AI summary, and download everything as CSV.',
  },
] as const;

const CALCULATED = [
  'Every metric, from the four values you confirm',
  'Formulas, statuses, and plain interpretations',
  'Charts and the downloadable CSV report',
  'A complete report with no AI at all',
] as const;

const EXPLAINED = [
  'A short summary of cost and schedule performance',
  'Observations, each marked favorable or unfavorable',
  'Cost risks and recommendations for the project manager',
  'Limitations, where a metric cannot be assessed',
] as const;

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className={`${styles.page} on-navy`}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={`${styles.container} ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <p className={styles.badge}>
              <BrandMark className={styles.badgeMark} />
              Earned Value Analysis made simple
            </p>
            <h1 id="landing-title" className={styles.heroTitle}>
              Understand project performance.{' '}
              <span className={styles.gradientText}>Make smarter decisions.</span>
            </h1>
            <p className={styles.heroLead}>
              Turn four essential project values into meaningful cost and schedule insights with
              EVA, a simple, transparent Earned Value Analysis platform.
            </p>
            <div className={styles.heroActions}>
              <Button variant="onNavy" className={styles.heroPrimary} onClick={onStart}>
                Create a project
              </Button>
              <ButtonLink
                variant="onNavySecondary"
                className={styles.heroSecondary}
                href="#sample-report"
                trailingIcon={<ArrowDown size={16} strokeWidth={2} />}
              >
                Explore sample report
              </ButtonLink>
            </div>
            <p className={styles.heroNote}>
              <Lock size={14} strokeWidth={2} aria-hidden="true" />
              No account needed. Your data stays in this browser tab.
            </p>
          </div>

          {/* The product rises from a lit horizon below the actions. */}
          <div id="sample-report" className={styles.heroStage} tabIndex={-1}>
            <ReportPreview />
          </div>
        </div>
      </section>

      <section id="features" className={styles.features} aria-labelledby="features-title">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <h2 id="features-title" className={styles.sectionTitle}>
              Everything an Earned Value report needs
            </h2>
            <p className={styles.sectionLead}>
              Every result comes with its formula and a plain interpretation, so you can check the
              arithmetic and explain it to others.
            </p>
          </div>
          <ul className={styles.cards}>
            {CAPABILITIES.map(({ title, icon: Icon, text, formulas }) => (
              <li key={title} className={styles.card}>
                <span className={styles.cardIcon} aria-hidden="true">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className={styles.cardTitle}>{title}</h3>
                <p className={styles.cardText}>{text}</p>
                {formulas.length > 0 ? (
                  <ul className={styles.formulas} aria-label={`${title} formulas`}>
                    {formulas.map((formula) => (
                      <li key={formula}>
                        <code>{formula}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how-it-works" className={styles.steps} aria-labelledby="how-title" tabIndex={-1}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <h2 id="how-title" className={styles.sectionTitle}>
              How it works
            </h2>
            <p className={styles.sectionLead}>
              Four steps, in the same order as the application. You can return to an earlier step at
              any time to change a value.
            </p>
          </div>
          <ol className={styles.stepList}>
            {STEPS.map(({ title, text }, index) => (
              <li key={title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepText}>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="ai-summary-feature" className={styles.ai} aria-labelledby="ai-title">
        <div className={`${styles.container} ${styles.aiInner}`}>
          <div className={styles.aiCopy}>
            <h2 id="ai-title" className={styles.sectionTitle}>
              An optional AI summary,{' '}
              <span className={styles.gradientText}>grounded in your numbers</span>
            </h2>
            <p className={styles.sectionLead}>
              EVA performs every calculation itself. The AI only explains results that are already
              calculated, never changes a figure, and is never needed for the report.
            </p>
            <p className={styles.aiPrivacy}>
              It receives only the currency and the four confirmed values. Project name,
              description, manager, and date are never sent.
            </p>
          </div>
          <div className={styles.aiPanels}>
            <div className={styles.aiPanel}>
              <h3 className={styles.aiPanelTitle}>
                <Calculator size={18} strokeWidth={1.75} aria-hidden="true" />
                Calculated by EVA
              </h3>
              <ul className={styles.aiList}>
                {CALCULATED.map((item) => (
                  <li key={item}>
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${styles.aiPanel} ${styles.aiPanelAccent}`}>
              <h3 className={styles.aiPanelTitle}>
                <MessageSquareText size={18} strokeWidth={1.75} aria-hidden="true" />
                Explained by AI, when you ask
              </h3>
              <ul className={styles.aiList}>
                {EXPLAINED.map((item) => (
                  <li key={item}>
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-title">
        <div className={`${styles.container} ${styles.ctaInner}`}>
          <h2 id="cta-title" className={styles.ctaTitle}>
            Turn project numbers into meaningful insights.
          </h2>
          <p className={styles.ctaText}>
            Start with four essential values and understand your project’s cost and schedule
            performance.
          </p>
          <Button variant="onNavy" className={styles.heroPrimary} onClick={onStart}>
            Create your first analysis
          </Button>
        </div>
      </section>
    </div>
  );
}
