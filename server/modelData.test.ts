import { describe, expect, it } from 'vitest';
import { createAnalysis } from '../src/domain/analysis';
import type { EvaInputs } from '../src/domain/evaTypes';
import { explainUndefinedMetric } from '../src/domain/explainUndefinedMetric';
import { formatCurrency, formatPercent, formatRatio } from '../src/domain/formatting';
import { interpretMetric } from '../src/domain/interpretations';
import { EVIDENCE_KEYS } from './contract';
import { prepareSummaryInput } from './handler';
import type { Fact } from './modelData';

const FIXTURE: EvaInputs = { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 };

function prepare(inputs: Partial<EvaInputs> = {}) {
  return prepareSummaryInput({
    schemaVersion: 1,
    currency: 'USD',
    inputs: { ...FIXTURE, ...inputs },
  });
}

function fact(facts: Fact[], key: string): Fact {
  const found = facts.find((item) => item.key === key);
  if (!found) throw new Error(`No fact ${key}`);
  return found;
}

describe('server-side recalculation', () => {
  it('derives the analysis with the shared domain engine for representative inputs', () => {
    for (const inputs of [
      {},
      { ac: 0 },
      { pv: 0 },
      { ev: 0 },
      { ac: 150_000 },
      { ev: 100_000, pv: 100_000 },
      { ac: 100_000 },
    ]) {
      const { analysis } = prepare(inputs);
      expect(analysis).toEqual(createAnalysis('USD', { ...FIXTURE, ...inputs }));
    }
  });

  it('matches the documented fixture (EVA_FORMULAS.md §8), with negative CV and SV', () => {
    const { metrics, budget } = prepare().analysis;
    expect(metrics.cv).toBe(-7_000);
    expect(metrics.sv).toBe(-5_000);
    expect(metrics.eac).toEqual({ status: 'defined', value: 120_000 });
    expect(metrics.vac).toEqual({ status: 'defined', value: -20_000 });
    expect(budget.budgetVariance).toBe(58_000);
    expect(budget.budgetVariancePercent).toEqual({ status: 'defined', value: 58 });
  });

  it('keeps a negative budget variance when AC exceeds BAC', () => {
    const { analysis, modelData } = prepare({ ac: 150_000 });
    expect(analysis.budget.budgetVariance).toBe(-50_000);
    expect(fact(modelData.facts, 'budgetVariance')).toMatchObject({ display: '-$50,000.00' });
    expect(fact(modelData.facts, 'budgetVariancePercent')).toMatchObject({ display: '-50.0%' });
  });
});

describe('model data document', () => {
  it('has exactly one fact per evidence key, in contract order', () => {
    expect(prepare().modelData.facts.map((item) => item.key)).toEqual([...EVIDENCE_KEYS]);
  });

  it("uses the report's own display strings and deterministic interpretations", () => {
    const { analysis, modelData } = prepare();
    expect(fact(modelData.facts, 'bac')).toEqual({
      key: 'bac',
      symbol: 'BAC',
      name: 'Budget at Completion',
      kind: 'input',
      status: 'defined',
      display: '$100,000.00',
    });
    expect(fact(modelData.facts, 'cpi')).toEqual({
      key: 'cpi',
      symbol: 'CPI',
      name: 'Cost Performance Index',
      kind: 'metric',
      formula: 'CPI = EV / AC',
      status: 'defined',
      display: formatRatio(analysis.metrics.cpi),
      tone: 'unfavorable',
      interpretation: interpretMetric('cpi', analysis).text,
    });
    expect(fact(modelData.facts, 'cv')).toMatchObject({
      display: formatCurrency(-7_000, 'USD'),
      tone: 'unfavorable',
    });
    expect(fact(modelData.facts, 'earnedCompletion')).toMatchObject({
      display: formatPercent(analysis.metrics.earnedCompletion),
    });
    expect(fact(modelData.facts, 'earnedCompletion')).not.toHaveProperty('symbol');
    expect(modelData.rules.budgetVarianceNote).toContain('not Cost Variance');
    expect(modelData.rules.assumptions[0]).toContain('EAC assumes the current cost efficiency');
  });

  it('keeps undefined metrics undefined, with their explanation and no value (AC = 0)', () => {
    const { modelData } = prepare({ ac: 0 });
    for (const key of ['cpi', 'eac', 'etc', 'vac', 'tcpiEac']) {
      const item = fact(modelData.facts, key);
      expect(item.status).toBe('undefined');
      expect(item).not.toHaveProperty('display');
      expect(item).not.toHaveProperty('tone');
    }
    expect(fact(modelData.facts, 'cpi')).toMatchObject({
      explanation: explainUndefinedMetric('cpi', 'actualCostZero'),
    });
    expect(fact(modelData.facts, 'eac')).toMatchObject({
      explanation: explainUndefinedMetric('eac', 'actualCostZero'),
    });
    // AC itself is a real zero input and stays defined.
    expect(fact(modelData.facts, 'ac')).toMatchObject({ status: 'defined', display: '$0.00' });
  });

  it('marks SPI undefined when PV = 0 and EAC undefined when EV = 0', () => {
    expect(fact(prepare({ pv: 0 }).modelData.facts, 'spi')).toMatchObject({
      status: 'undefined',
      explanation: explainUndefinedMetric('spi', 'plannedValueZero'),
    });
    const evZero = prepare({ ev: 0 }).modelData.facts;
    expect(fact(evZero, 'cpi')).toMatchObject({ status: 'defined', display: '0.0000' });
    expect(fact(evZero, 'eac')).toMatchObject({
      status: 'undefined',
      explanation: explainUndefinedMetric('eac', 'earnedValueZero'),
    });
  });

  it('never contains NaN, Infinity, project metadata, or raw unformatted values', () => {
    for (const inputs of [{}, { ac: 0, pv: 0, ev: 0 }, { ac: Number.MAX_SAFE_INTEGER }]) {
      const json = JSON.stringify(prepare(inputs).modelData);
      expect(json).not.toMatch(/NaN|Infinity|null/);
      expect(json).not.toMatch(/projectName|description|manager|reportingDate/);
    }
    expect(JSON.stringify(prepare().modelData)).not.toContain('0.8333333');
  });
});
