import {
  CircleAlert,
  FileText,
  Info,
  Lightbulb,
  ListChecks,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ToneBadge } from '@/components/report/MetricList';
import { Button } from '@/components/ui/Button';
import type { Analysis } from '@/domain/analysis';
import { DISPLAY_LOCALE } from '@/domain/formatting';
import type { Tone } from '@/domain/interpretations';
import type { AiSummaryItem, AiSummaryResponse, Assessment, EvidenceKey } from './aiSummaryApi';
import { AI_SUMMARY_READING_NOTES, describeFailure } from './aiSummaryMessages';
import { ASSESSMENT_LABELS, describeEvidence } from './evidence';
import { useAiSummary } from './useAiSummary';
import styles from './AiSummaryPanel.module.css';

const ASSESSMENT_TONES: Record<Assessment, Tone> = {
  favorable: 'favorable',
  unfavorable: 'unfavorable',
  neutral: 'neutral',
  notAssessable: 'undefined',
};

function Evidence({ keys, analysis }: { keys: readonly EvidenceKey[]; analysis: Analysis }) {
  return (
    <ul className={styles.evidence} aria-label="Evidence from the calculated results">
      {keys.map((key) => {
        const { label, name, display } = describeEvidence(key, analysis);
        return (
          <li key={key} className={styles.chip}>
            {label === name ? (
              <span className={styles.chipLabel}>{label}</span>
            ) : (
              <abbr title={name} className={styles.chipLabel}>
                {label}
              </abbr>
            )}{' '}
            <span className="numeric">{display}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PartTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className={styles.partTitle}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" className={styles.partIcon} />
      {children}
    </h3>
  );
}

function ItemList({
  title,
  icon,
  items,
  analysis,
}: {
  title: string;
  icon: LucideIcon;
  items: readonly AiSummaryItem[];
  analysis: Analysis;
}) {
  if (items.length === 0) return null;
  return (
    <section className={styles.part} aria-label={title}>
      <PartTitle icon={icon}>{title}</PartTitle>
      <ul className={styles.items}>
        {items.map((item, index) => (
          <li key={index} className={styles.item}>
            <p className={styles.itemText}>{item.text}</p>
            <Evidence keys={item.evidence} analysis={analysis} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function SummaryContent({
  response,
  analysis,
}: {
  response: AiSummaryResponse;
  analysis: Analysis;
}) {
  const { content } = response;
  return (
    <div className={styles.content}>
      <p className={styles.meta}>
        <span className={styles.aiLabel}>AI-generated</span>
        <span>
          Generated{' '}
          <time dateTime={response.generatedAt}>{formatGeneratedAt(response.generatedAt)}</time>
        </span>
        <span>
          Model: <span className={styles.model}>{response.modelLabel}</span>
        </span>
      </p>

      {/* The summary leads; the four groups below are details to scan. */}
      <section className={`${styles.part} ${styles.lead}`} aria-label="Summary">
        <h3 className={styles.partTitle}>Summary</h3>
        <p className={styles.summary}>{content.summary}</p>
      </section>

      <div className={styles.parts}>
        <section className={`${styles.part} ${styles.wide}`} aria-label="Observations">
          <PartTitle icon={ListChecks}>Observations</PartTitle>
          <ul className={styles.items}>
            {content.observations.map((observation, index) => (
              <li key={index} className={styles.item}>
                <p className={styles.itemText}>
                  <ToneBadge
                    tone={ASSESSMENT_TONES[observation.assessment]}
                    label={ASSESSMENT_LABELS[observation.assessment]}
                  />
                  <span>{observation.text}</span>
                </p>
                <Evidence keys={observation.evidence} analysis={analysis} />
              </li>
            ))}
          </ul>
        </section>

        <ItemList
          title="Cost risks"
          icon={TriangleAlert}
          items={content.costRisks}
          analysis={analysis}
        />
        <ItemList
          title="Recommendations"
          icon={Lightbulb}
          items={content.recommendations}
          analysis={analysis}
        />
        <ItemList title="Limitations" icon={Info} items={content.limitations} analysis={analysis} />
      </div>
    </div>
  );
}

/** Fixed EVA text, outside the AI content frame, so it is never mistaken for generated text. */
function ReadingNotes() {
  return (
    <section className={styles.readingNotes} aria-labelledby="ai-reading-notes-title">
      <h3 id="ai-reading-notes-title" className={styles.partTitle}>
        How to read the AI text
      </h3>
      <p className={styles.readingSource}>Written by EVA, not generated by the AI.</p>
      <ul className={styles.readingList}>
        {AI_SUMMARY_READING_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

const DATA_NOTE =
  'Generating sends only the currency and the four confirmed inputs (BAC, PV, EV, AC) to the local EVA backend, which recalculates the metrics and asks the Groq AI service to explain them. The project name, description, manager, and reporting date are never sent. Nothing is generated until you ask.';

/** Before a summary exists: what it offers in one line, and exactly what would be sent. */
function Invitation() {
  return (
    <div className={styles.invitation}>
      <div className={styles.invitationText}>
        <p className={styles.invitationTitle}>
          Get a plain-language reading of these results: observations, cost risks, and
          recommendations.
        </p>
        <p className={styles.dataNote}>{DATA_NOTE}</p>
      </div>
    </div>
  );
}

/**
 * The AI summary of the confirmed analysis (`UI_WORKFLOW.md` §8). AI text is rendered as plain
 * text only; values beside it come from the browser's own analysis.
 */
export function AiSummaryPanel({ analysis }: { analysis: Analysis }) {
  const { view, generate, cancel } = useAiSummary();

  let status: ReactNode = null;
  let actions: ReactNode = null;
  let body: ReactNode = null;

  switch (view.status) {
    case 'idle':
      body = <Invitation />;
      actions = (
        // The AI section's accent action. It is still only offered, never run automatically.
        <Button
          variant="accent"
          leadingIcon={<FileText size={16} strokeWidth={2} />}
          onClick={generate}
        >
          Generate AI summary
        </Button>
      );
      break;

    case 'loading':
      body = <Invitation />;
      status = <span className={styles.loading}>Generating the AI summary…</span>;
      actions = (
        <>
          {/* aria-disabled rather than disabled keeps keyboard focus on the button. A second
              click is ignored: the provider allows only one pending request. */}
          <Button
            variant="secondary"
            leadingIcon={<FileText size={16} strokeWidth={2} />}
            aria-disabled="true"
            className={styles.pending}
            onClick={generate}
          >
            Generating…
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<X size={16} strokeWidth={2} />}
            onClick={cancel}
          >
            Cancel
          </Button>
        </>
      );
      break;

    case 'success':
      body = (
        <>
          <SummaryContent response={view.response} analysis={analysis} />
          <ReadingNotes />
        </>
      );
      status = <span className="visually-hidden">AI summary generated.</span>;
      actions = (
        <Button
          variant="secondary"
          leadingIcon={<RefreshCw size={16} strokeWidth={2} />}
          onClick={generate}
        >
          Regenerate AI summary
        </Button>
      );
      break;

    case 'error': {
      const message = describeFailure(view.failure);
      status = (
        <span className={styles.error}>
          <CircleAlert size={16} strokeWidth={2} aria-hidden="true" className={styles.errorIcon} />
          <span>{message.text}</span>
        </span>
      );
      if (message.retry) {
        body = <Invitation />;
        actions = (
          <Button
            variant="secondary"
            leadingIcon={<RefreshCw size={16} strokeWidth={2} />}
            onClick={generate}
          >
            Try again
          </Button>
        );
      }
      break;
    }
  }

  return (
    <div className={styles.panel} aria-busy={view.status === 'loading'}>
      {body}
      <p role="status" className={styles.status}>
        {status}
      </p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
