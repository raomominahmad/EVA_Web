import { describe, expect, it } from 'vitest';
import type { AiSummaryContent } from './contract';
import { validateSummaryContent } from './responseValidation';
import { fixtureInput, validContent } from './testSupport';

const { modelData } = fixtureInput();

function check(content: unknown, data = modelData) {
  return validateSummaryContent(JSON.stringify(content), data);
}

function reasonOf(content: unknown, data = modelData) {
  const result = check(content, data);
  return result.ok ? 'ok' : result.reason;
}

function edit(change: (content: AiSummaryContent) => void): AiSummaryContent {
  const content = validContent();
  change(content);
  return content;
}

describe('validateSummaryContent', () => {
  it('accepts a valid summary and returns it unchanged', () => {
    expect(check(validContent())).toEqual({ ok: true, content: validContent() });
  });

  it('rejects text that is not JSON, or JSON that is not the content object', () => {
    expect(validateSummaryContent('{"summary": "cut off', modelData)).toEqual({
      ok: false,
      reason: 'json',
    });
    expect(validateSummaryContent('Here is your summary.', modelData)).toMatchObject({ ok: false });
    expect(reasonOf([validContent()])).toBe('schema');
    expect(reasonOf(null)).toBe('schema');
  });

  it('rejects missing and additional properties at every level', () => {
    const { limitations: _limitations, ...missing } = validContent();
    expect(reasonOf(missing)).toBe('schema');
    expect(reasonOf({ ...validContent(), score: 7 })).toBe('schema');
    expect(
      reasonOf(edit((c) => Object.assign(c.observations[0] ?? {}, { severity: 'high' }))),
    ).toBe('schema');
    expect(
      reasonOf(edit((c) => Object.assign(c.costRisks[0] ?? {}, { assessment: 'neutral' }))),
    ).toBe('schema');
  });

  it('rejects wrong types, invalid enums, and invalid or duplicate evidence keys', () => {
    expect(reasonOf({ ...validContent(), summary: 42 })).toBe('schema');
    expect(
      reasonOf(edit((c) => ((c.observations[0] as { assessment: string }).assessment = 'good'))),
    ).toBe('schema');
    expect(
      reasonOf(
        edit((c) => ((c.observations[0] as { evidence: string[] }).evidence = ['projectName'])),
      ),
    ).toBe('schema');
    expect(reasonOf(edit((c) => (c.recommendations[0]!.evidence = ['cpi', 'cpi'])))).toBe('schema');
    expect(reasonOf(edit((c) => (c.recommendations[0]!.evidence = [])))).toBe('schema');
    expect(
      reasonOf(edit((c) => (c.recommendations[0]!.evidence = ['cv', 'sv', 'cpi', 'spi', 'eac']))),
    ).toBe('schema');
  });

  it('enforces the count and length limits that are not sent to the provider', () => {
    expect(reasonOf(edit((c) => (c.observations = [])))).toBe('schema');
    expect(
      reasonOf(edit((c) => (c.observations = Array.from({ length: 7 }, () => c.observations[2]!)))),
    ).toBe('schema');
    expect(
      reasonOf(edit((c) => (c.limitations = Array.from({ length: 5 }, () => c.limitations[0]!)))),
    ).toBe('schema');
    expect(reasonOf(edit((c) => (c.summary = 'a'.repeat(601))))).toBe('schema');
    expect(reasonOf(edit((c) => (c.costRisks[0]!.text = 'a'.repeat(401))))).toBe('schema');
    expect(reasonOf(edit((c) => (c.costRisks[0]!.text = '   ')))).toBe('schema');
    expect(reasonOf(edit((c) => (c.summary = 'a'.repeat(600))))).toBe('ok');
  });

  it.each([
    ['a line break', 'Cost is over budget.\nReview it.'],
    ['HTML', 'Cost is <b>over</b> budget.'],
    ['Markdown code', 'Use `CPI` here.'],
    ['a Markdown link', 'See [EVM](https://example.com).'],
    ['a URL', 'See https://example.com for details.'],
    ['bold Markdown', 'Cost is **over** budget.'],
  ])('rejects %s in the text', (_label, text) => {
    expect(reasonOf(edit((c) => (c.summary = text)))).toBe('plainText');
  });

  it.each(['undefined', 'NaN', 'Infinity', 'guaranteed', 'will definitely', 'certain to'])(
    'rejects the denied wording "%s"',
    (word) => {
      expect(reasonOf(edit((c) => (c.summary = `The forecast is ${word} wrong.`)))).toBe('wording');
    },
  );

  it('rejects numbers that were not supplied, including rounded or recalculated values', () => {
    for (const text of [
      'CPI is 0.83.',
      'The project is 17% over the plan.',
      'EAC is $120,000.',
      'The overrun is $7,500.00.',
      'This affects 3 work packages.',
      'Completion is expected in 2027.',
    ]) {
      expect(reasonOf(edit((c) => (c.summary = text)))).toBe('inventedNumber');
    }
  });

  it('accepts supplied display values, their absolute values, and the 1.00 benchmark', () => {
    for (const text of [
      'CV is -$7,000.00 and VAC is -$20,000.00.',
      'The overrun on completed work is $7,000.00.',
      'CPI of 0.8333 is below the 1.00 benchmark.',
      'Each unit of cost earns less than 1 unit of value; 58.0% of the budget remains.',
    ]) {
      expect(reasonOf(edit((c) => (c.summary = text)))).toBe('ok');
    }
  });

  describe('undefined metrics (AC = 0)', () => {
    const zeroAc = fixtureInput({ ac: 0 }).modelData;
    const base = (): AiSummaryContent => ({
      summary: 'No cost has been incurred, so cost efficiency cannot be assessed yet.',
      observations: [
        {
          text: 'CPI cannot be calculated because Actual Cost is zero.',
          assessment: 'notAssessable',
          evidence: ['cpi', 'ac'],
        },
      ],
      costRisks: [],
      recommendations: [],
      limitations: [
        { text: 'EAC cannot be calculated, so no cost forecast is available.', evidence: ['eac'] },
      ],
    });

    it('accepts undefined metrics in limitations and notAssessable observations', () => {
      expect(reasonOf(base(), zeroAc)).toBe('ok');
    });

    it('rejects an undefined metric used as evidence elsewhere', () => {
      const content = base();
      content.costRisks = [{ text: 'The forecast may exceed the budget.', evidence: ['eac'] }];
      expect(reasonOf(content, zeroAc)).toBe('undefinedMetric');
      const observation = base();
      observation.observations[0]!.assessment = 'unfavorable';
      expect(reasonOf(observation, zeroAc)).toBe('undefinedMetric');
    });

    it('requires undefined CPI, SPI, or EAC to be explained', () => {
      const content = base();
      content.limitations = [];
      expect(reasonOf(content, zeroAc)).toBe('missingLimitation');
    });

    it('rejects a number stated for an undefined metric (no display value exists)', () => {
      const content = base();
      content.limitations[0]!.text = 'EAC would be $0.50 if AC were known.';
      expect(reasonOf(content, zeroAc)).toBe('inventedNumber');
    });
  });

  it('rejects assessments that contradict the deterministic tones', () => {
    // CPI and CV are unfavorable for the fixture.
    expect(reasonOf(edit((c) => (c.observations[0]!.assessment = 'favorable')))).toBe('assessment');
    // Positive budget variance is neutral, never favorable.
    expect(reasonOf(edit((c) => (c.observations[2]!.assessment = 'favorable')))).toBe('assessment');
    // notAssessable needs an undefined metric.
    expect(reasonOf(edit((c) => (c.observations[1]!.assessment = 'notAssessable')))).toBe(
      'assessment',
    );
  });

  it('rejects calling a favorable SPI favorable cost performance when CPI is unfavorable', () => {
    const data = fixtureInput({ pv: 30_000 }).modelData; // SPI > 1, CPI < 1.
    const content = edit((c) => {
      c.observations[1] = {
        text: 'Schedule progress is favorable, so cost performance is favorable too.',
        assessment: 'favorable',
        evidence: ['spi', 'cpi'],
      };
    });
    content.summary = 'Cost efficiency is unfavorable.';
    content.observations = [content.observations[1]!];
    content.costRisks = [];
    content.recommendations = [];
    content.limitations = [];
    expect(reasonOf(content, data)).toBe('assessment');
  });
});
