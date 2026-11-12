/**
 * Server-side validation of provider output (`PROJECT_REQUIREMENTS.md` §11.4). The provider is
 * untrusted: a response is accepted only if it matches the content schema exactly, is plain text,
 * states no number that was not supplied, handles undefined metrics correctly, and agrees with the
 * deterministic tones. Nothing is repaired: any failure rejects the whole response.
 */
import { ASSESSMENTS, CONTENT_LIMITS, EVIDENCE_KEYS } from './contract.ts';
import type {
  AiSummaryContent,
  AiSummaryItem,
  AiSummaryObservation,
  Assessment,
  EvidenceKey,
} from './contract.ts';
import type { Fact, ModelData } from './modelData.ts';

/** Why validation failed. For tests only; never sent to clients or logged with content. */
export type ValidationFailureReason =
  | 'json'
  | 'schema'
  | 'plainText'
  | 'inventedNumber'
  | 'undefinedMetric'
  | 'missingLimitation'
  | 'assessment'
  | 'wording';

export type ContentValidationResult =
  { ok: true; content: AiSummaryContent } | { ok: false; reason: ValidationFailureReason };

type Limit = { readonly min: number; readonly max: number };

const CONTENT_KEYS = ['summary', 'observations', 'costRisks', 'recommendations', 'limitations'];
const EVIDENCE_SET = new Set<string>(EVIDENCE_KEYS);
const ASSESSMENT_SET = new Set<string>(ASSESSMENTS);

/** A number as written in text: grouped thousands or plain digits, with optional decimals. */
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
/** The 1.00 benchmark for CPI, SPI, and TCPI may always be named. */
const BENCHMARKS = ['1', '1.00'];
/** Metrics that must be explained in a limitation when they have no value (§11.4 rule 4). */
const MUST_EXPLAIN_IF_UNDEFINED: readonly EvidenceKey[] = ['cpi', 'spi', 'eac'];

// eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const MARKUP = /<|`|\]\(|\*\*|https?:\/\/|www\./i;
const DENY = /\b(?:nan|infinity|undefined|guaranteed?|will definitely|certain to)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function inRange(length: number, limit: Limit): boolean {
  return length >= limit.min && length <= limit.max;
}

function isText(value: unknown, limit: Limit): value is string {
  return typeof value === 'string' && value.trim().length > 0 && inRange(value.length, limit);
}

function isEvidence(value: unknown): value is EvidenceKey[] {
  return (
    Array.isArray(value) &&
    inRange(value.length, CONTENT_LIMITS.evidence) &&
    value.every((key) => typeof key === 'string' && EVIDENCE_SET.has(key)) &&
    new Set(value).size === value.length
  );
}

function isItem(value: unknown): value is AiSummaryItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['text', 'evidence']) &&
    isText(value.text, CONTENT_LIMITS.textLength) &&
    isEvidence(value.evidence)
  );
}

function isObservation(value: unknown): value is AiSummaryObservation {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['text', 'assessment', 'evidence']) &&
    isText(value.text, CONTENT_LIMITS.textLength) &&
    typeof value.assessment === 'string' &&
    ASSESSMENT_SET.has(value.assessment) &&
    isEvidence(value.evidence)
  );
}

function isList<T>(
  value: unknown,
  limit: Limit,
  guard: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && inRange(value.length, limit) && value.every(guard);
}

/** Rule 1: the exact `content` schema, counts, and lengths. */
function parseContent(value: unknown): AiSummaryContent | null {
  if (!isRecord(value) || !hasExactKeys(value, CONTENT_KEYS)) return null;
  const { summary, observations, costRisks, recommendations, limitations } = value;
  if (
    isText(summary, CONTENT_LIMITS.summaryLength) &&
    isList(observations, CONTENT_LIMITS.observations, isObservation) &&
    isList(costRisks, CONTENT_LIMITS.costRisks, isItem) &&
    isList(recommendations, CONTENT_LIMITS.recommendations, isItem) &&
    isList(limitations, CONTENT_LIMITS.limitations, isItem)
  ) {
    return { summary, observations, costRisks, recommendations, limitations };
  }
  return null;
}

/** Numbers that may appear: those inside the display strings of defined facts, and 1 / 1.00. */
function allowedNumbers(facts: readonly Fact[]): Set<string> {
  const allowed = new Set(BENCHMARKS);
  for (const fact of facts) {
    if (fact.status !== 'defined') continue;
    for (const match of fact.display.matchAll(NUMBER)) allowed.add(match[0]);
  }
  return allowed;
}

function allTexts(content: AiSummaryContent): string[] {
  return [
    content.summary,
    ...[
      ...content.observations,
      ...content.costRisks,
      ...content.recommendations,
      ...content.limitations,
    ].map((item) => item.text),
  ];
}

/** Rule 5: an assessment must agree with the tones of the facts it references. */
function assessmentAgrees(
  assessment: Assessment,
  evidence: readonly EvidenceKey[],
  facts: ReadonlyMap<string, Fact>,
): boolean {
  const referenced = evidence.map((key) => facts.get(key));
  const tones = referenced.map((fact) => (fact?.status === 'defined' ? fact.tone : undefined));
  switch (assessment) {
    case 'favorable':
      return tones.includes('favorable') && !tones.includes('unfavorable');
    case 'unfavorable':
      return tones.includes('unfavorable') && !tones.includes('favorable');
    case 'notAssessable':
      return referenced.some((fact) => fact?.status === 'undefined');
    case 'neutral':
      return true;
  }
}

/**
 * Parses and validates the provider's raw text against the facts that were sent to it.
 * Returns the content unchanged when, and only when, every rule holds.
 */
export function validateSummaryContent(raw: string, modelData: ModelData): ContentValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }

  const content = parseContent(parsed);
  if (!content) return { ok: false, reason: 'schema' };

  const texts = allTexts(content);
  if (texts.some((text) => CONTROL.test(text) || MARKUP.test(text))) {
    return { ok: false, reason: 'plainText' };
  }
  if (texts.some((text) => DENY.test(text))) return { ok: false, reason: 'wording' };

  const allowed = allowedNumbers(modelData.facts);
  for (const text of texts) {
    for (const match of text.matchAll(NUMBER)) {
      if (!allowed.has(match[0])) return { ok: false, reason: 'inventedNumber' };
    }
  }

  const facts = new Map(modelData.facts.map((fact) => [fact.key, fact]));
  const isUndefined = (key: EvidenceKey) => facts.get(key)?.status === 'undefined';

  // Rule 4: undefined metrics only in limitations or notAssessable observations.
  const misused =
    content.observations.some(
      (item) => item.assessment !== 'notAssessable' && item.evidence.some(isUndefined),
    ) ||
    [...content.costRisks, ...content.recommendations].some((item) =>
      item.evidence.some(isUndefined),
    );
  if (misused) return { ok: false, reason: 'undefinedMetric' };

  const explained = new Set<EvidenceKey>([
    ...content.limitations.flatMap((item) => item.evidence),
    ...content.observations
      .filter((item) => item.assessment === 'notAssessable')
      .flatMap((item) => item.evidence),
  ]);
  if (MUST_EXPLAIN_IF_UNDEFINED.some((key) => isUndefined(key) && !explained.has(key))) {
    return { ok: false, reason: 'missingLimitation' };
  }

  if (
    !content.observations.every((item) => assessmentAgrees(item.assessment, item.evidence, facts))
  ) {
    return { ok: false, reason: 'assessment' };
  }

  return { ok: true, content };
}
