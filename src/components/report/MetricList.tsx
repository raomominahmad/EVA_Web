import { ArrowDown, ArrowUp, CircleSlash } from 'lucide-react';
import type { Analysis } from '@/domain/analysis';
import { formatCurrency, formatPercent, formatRatio } from '@/domain/formatting';
import { interpretMetric } from '@/domain/interpretations';
import type { Tone } from '@/domain/interpretations';
import { METRIC_DEFINITIONS } from '@/domain/metricDefinitions';
import type { MetricKey } from '@/domain/metricDefinitions';
import styles from './MetricList.module.css';
import { SignedNumber } from './SignedNumber';

const TONE_LABEL: Partial<Record<Tone, string>> = {
  favorable: 'Favorable',
  unfavorable: 'Unfavorable',
  undefined: 'Not available',
};

/** Status shown with an icon and text, never by color alone. Neutral results have no badge. */
export function ToneBadge({ tone, label }: { tone: Tone; label?: string }) {
  const text = label ?? TONE_LABEL[tone];
  if (!text) return null;
  const Icon = tone === 'favorable' ? ArrowUp : tone === 'unfavorable' ? ArrowDown : CircleSlash;
  return (
    <span className={styles.badge} data-tone={tone}>
      {tone === 'neutral' ? null : <Icon size={13} strokeWidth={2.25} aria-hidden="true" />}
      {text}
    </span>
  );
}

function displayValue(key: MetricKey, analysis: Analysis): string {
  const { unit } = METRIC_DEFINITIONS[key];
  const value = analysis.metrics[key];
  if (unit === 'currency') return formatCurrency(value, analysis.currency);
  return unit === 'index' ? formatRatio(value) : formatPercent(value);
}

interface MetricListProps {
  analysis: Analysis;
  metrics: readonly MetricKey[];
}

/** Calculated metrics with name, abbreviation, value, formula, definition, and interpretation. */
export function MetricList({ analysis, metrics }: MetricListProps) {
  return (
    <ul className={styles.list}>
      {metrics.map((key) => {
        const { symbol, name, formula, definition } = METRIC_DEFINITIONS[key];
        const interpretation = interpretMetric(key, analysis);
        return (
          <li key={key} className={styles.item} data-metric={key}>
            {/* Read top to bottom: what it is and its status, the value, what it means, and
                finally how it is calculated. */}
            <div className={styles.head}>
              <h3 className={styles.name}>
                {symbol ? (
                  <>
                    <abbr className={styles.symbol}>{symbol}</abbr>{' '}
                  </>
                ) : null}
                <span>{name}</span>
              </h3>
              <ToneBadge tone={interpretation.tone} />
            </div>
            <p className={`${styles.value} numeric`}>
              <SignedNumber text={displayValue(key, analysis)} />
            </p>
            <p className={styles.interpretation}>{interpretation.text}</p>
            <p className={styles.formula}>
              <span className="visually-hidden">Formula: </span>
              <code>{formula}</code>
              <span className={styles.definition}>{definition}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
