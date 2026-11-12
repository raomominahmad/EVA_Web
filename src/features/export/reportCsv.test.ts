import { describe, expect, it } from 'vitest';
import { createAnalysis } from '@/domain/analysis';
import type { EvaInputs } from '@/domain/evaTypes';
import type { ProjectDetails } from '@/domain/projectDetails';
import { parseCsv } from '@/features/import/csv/parseCsv';
import type { AiSummaryResponse } from '@/features/aiSummary/aiSummaryApi';
import { aiSummaryResponse } from '@/test/fixtures/aiSummary';
import { AI_SECTION, buildReportCsv, REPORT_CSV_HEADER, reportFileName } from './reportCsv';

const PROJECT: ProjectDetails = {
  name: 'Billing platform, "core" release',
  description: 'Line one,\nline "two"',
  manager: '=HYPERLINK("http://example.test")',
  reportingDate: '2026-03-31',
};

const FIXTURE: EvaInputs = { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 };

function records(inputs: Partial<EvaInputs> = {}, project: ProjectDetails = PROJECT) {
  const csv = buildReportCsv(createAnalysis('USD', { ...FIXTURE, ...inputs }), project);
  const parsed = parseCsv(csv, 50);
  if (!parsed.ok) throw new Error(`Invalid CSV: ${parsed.reason} on line ${parsed.line}`);
  return { csv, records: parsed.records };
}

function find(rows: string[][], section: string, item: string) {
  const row = rows.find((record) => record[0] === section && record[1] === item);
  if (!row) throw new Error(`Missing row ${section} / ${item}`);
  const [, , symbol, value, display, unit, definition, interpretation] = row;
  return { symbol, value, display, unit, definition, interpretation };
}

describe('buildReportCsv', () => {
  it('writes a header and the same number of fields in every row, with CRLF endings', () => {
    const { csv, records: rows } = records();
    expect(rows[0]).toEqual([...REPORT_CSV_HEADER]);
    for (const row of rows) expect(row).toHaveLength(REPORT_CSV_HEADER.length);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replaceAll('\r\n', '')).not.toMatch(/\r(?!\n)/);
  });

  it('includes project metadata with correct escaping and formula protection', () => {
    const { records: rows } = records();
    expect(find(rows, 'Project', 'Project name').value).toBe('Billing platform, "core" release');
    expect(find(rows, 'Project', 'Description').value).toBe('Line one,\nline "two"');
    expect(find(rows, 'Project', 'Project manager').value).toBe(
      `'=HYPERLINK("http://example.test")`,
    );
    expect(find(rows, 'Project', 'Reporting date')).toMatchObject({
      value: '2026-03-31',
      display: 'March 31, 2026',
    });
    expect(find(rows, 'Project', 'Currency')).toMatchObject({
      value: 'USD',
      display: 'USD (US dollar)',
    });
  });

  it('labels absent metadata as not provided', () => {
    const { records: rows } = records(
      {},
      { name: 'P', description: '', manager: '', reportingDate: '' },
    );
    expect(find(rows, 'Project', 'Reporting date').value).toBe('Not provided');
    expect(find(rows, 'Project', 'Project manager').value).toBe('Not provided');
  });

  it('exports confirmed inputs and metrics at full precision with display values', () => {
    const { records: rows } = records();
    expect(find(rows, 'Inputs', 'Budget at Completion')).toMatchObject({
      symbol: 'BAC',
      value: '100000',
      display: '$100,000.00',
      unit: 'USD',
    });
    expect(find(rows, 'Cost performance', 'Cost Variance')).toMatchObject({
      symbol: 'CV',
      value: '-7000',
      display: "'-$7,000.00",
    });
    expect(find(rows, 'Cost performance', 'Cost Performance Index')).toMatchObject({
      value: String(35_000 / 42_000),
      display: '0.8333',
      unit: 'Ratio',
    });
    expect(find(rows, 'Forecast', 'Estimate at Completion').value).toBe('120000');
    expect(find(rows, 'Forecast', 'Variance at Completion').value).toBe('-20000');
    expect(find(rows, 'Progress', 'Budget utilization')).toMatchObject({
      value: '42',
      display: '42.0%',
      unit: '% of BAC',
    });
    expect(find(rows, 'Forecast', 'Estimate at Completion').definition).toContain(
      'EAC = BAC / CPI',
    );
  });

  it('includes the budget-versus-actual comparison, separate from CV', () => {
    const { records: rows } = records();
    const section = 'Budget versus actual';
    expect(find(rows, section, 'Estimated cost').value).toBe('100000');
    expect(find(rows, section, 'Actual cost').value).toBe('42000');
    expect(find(rows, section, 'Budget variance')).toMatchObject({
      symbol: '',
      value: '58000',
      display: '$58,000.00',
    });
    expect(find(rows, section, 'Percentage variance')).toMatchObject({
      value: '58',
      display: '58.0%',
      unit: '% of BAC',
    });
    expect(find(rows, section, 'Budget variance').definition).toContain(
      'Not Cost Variance (CV = EV − AC)',
    );
    expect(find(rows, section, 'Note').definition).toContain('not Cost Variance');
  });

  it('keeps negative budget variance raw and protects its display value', () => {
    const { records: rows } = records({ ac: 150_000 });
    expect(find(rows, 'Budget versus actual', 'Budget variance')).toMatchObject({
      value: '-50000',
      display: "'-$50,000.00",
    });
    expect(find(rows, 'Budget versus actual', 'Percentage variance')).toMatchObject({
      value: '-50',
      display: "'-50.0%",
    });
  });

  it('exports undefined metrics as N/A with the explanation', () => {
    const { csv, records: rows } = records({ ac: 0, pv: 0 });
    expect(find(rows, 'Cost performance', 'Cost Performance Index')).toMatchObject({
      value: 'N/A',
      display: 'N/A',
    });
    expect(find(rows, 'Forecast', 'Estimate at Completion').interpretation).toContain(
      'EAC cannot be calculated',
    );
    expect(
      find(rows, 'Schedule performance', 'Schedule Performance Index').interpretation,
    ).toContain('Planned Value (PV) is zero');
    expect(find(rows, 'Summary', 'Cost performance').value).toBe('Not assessable');
    expect(csv).not.toMatch(/NaN|Infinity/);
  });

  it('includes the forecast assumption and the comparison limitation', () => {
    const { csv } = records();
    expect(csv).toContain('EAC assumes the current cost efficiency (CPI) continues');
    expect(csv).toContain('does not account for work completed');
  });
});

function withSummary(summary: AiSummaryResponse | null, inputs: Partial<EvaInputs> = {}) {
  const csv = buildReportCsv(createAnalysis('USD', { ...FIXTURE, ...inputs }), PROJECT, summary);
  const parsed = parseCsv(csv, 100);
  if (!parsed.ok) throw new Error(`Invalid CSV: ${parsed.reason} on line ${parsed.line}`);
  return { csv, records: parsed.records };
}

describe('buildReportCsv with an AI summary', () => {
  it('has no AI rows when no summary exists', () => {
    const { csv } = withSummary(null);
    expect(csv).toBe(records().csv);
    expect(csv).not.toContain('AI-generated');
  });

  it('appends the current summary as AI-generated rows after the unchanged deterministic rows', () => {
    const { csv, records: rows } = withSummary(aiSummaryResponse());
    const { csv: deterministic, records: deterministicRows } = records();
    expect(csv.startsWith(deterministic)).toBe(true);

    const aiRows = rows.slice(deterministicRows.length);
    for (const row of aiRows) {
      expect(row[0]).toBe(AI_SECTION);
      expect(row).toHaveLength(REPORT_CSV_HEADER.length);
      // No AI row carries a numeric value; AI text is never a calculated metric.
      expect(row[3] !== '' && Number.isFinite(Number(row[3]))).toBe(false);
    }
    expect(aiRows.map((row) => row[1])).toEqual([
      'Notice',
      'Model',
      'Generated at',
      'Summary',
      'Observation 1',
      'Observation 2',
      'Cost risk 1',
      'Recommendation 1',
      'Limitation 1',
    ]);
    expect(find(rows, AI_SECTION, 'Notice').definition).toContain('Not a calculated EVA metric');
    expect(find(rows, AI_SECTION, 'Model').value).toBe('openai/gpt-oss-120b');
    expect(find(rows, AI_SECTION, 'Generated at').value).toBe('2026-11-11T10:15:00.000Z');
    expect(find(rows, AI_SECTION, 'Summary').interpretation).toBe(
      aiSummaryResponse().content.summary,
    );
    expect(find(rows, AI_SECTION, 'Observation 1')).toMatchObject({
      value: 'Unfavorable',
      definition: 'Evidence: CV, CPI.',
      interpretation: 'The completed work cost more than its budgeted value.',
    });
    expect(find(rows, AI_SECTION, 'Limitation 1').definition).toBe('Evidence: Planned completion.');
  });

  it('excludes a summary of other inputs (stale)', () => {
    expect(withSummary(aiSummaryResponse(), { ac: 45_000 }).csv).not.toContain('AI-generated');
    expect(
      withSummary(aiSummaryResponse({ inputFingerprint: 'v1:EUR:100000:40000:35000:42000' })).csv,
    ).not.toContain('AI-generated');
  });

  it('escapes AI text and neutralizes spreadsheet formulas in it', () => {
    const summary = aiSummaryResponse();
    summary.content.summary = '=HYPERLINK("http://example.test"), "quoted"';
    summary.content.costRisks = [{ text: '-2 risks, @SUM(A1)', evidence: ['eac'] }];
    summary.modelLabel = '+model';
    const { csv, records: rows } = withSummary(summary);

    expect(find(rows, AI_SECTION, 'Summary').interpretation).toBe(
      `'=HYPERLINK("http://example.test"), "quoted"`,
    );
    expect(find(rows, AI_SECTION, 'Cost risk 1').interpretation).toBe(`'-2 risks, @SUM(A1)`);
    expect(find(rows, AI_SECTION, 'Model').value).toBe(`'+model`);
    expect(csv).toContain(`"'=HYPERLINK(""http://example.test""), ""quoted"""`);
  });
});

describe('reportFileName', () => {
  it('builds a safe name from the project name and reporting date', () => {
    expect(reportFileName(PROJECT)).toBe('eva-report-billing-platform-core-release-2026-03-31.csv');
    expect(reportFileName({ ...PROJECT, name: 'Café / Ünïcode: ***', reportingDate: '' })).toBe(
      'eva-report-cafe-unicode.csv',
    );
    expect(reportFileName({ ...PROJECT, name: '***' })).toBe('eva-report-2026-03-31.csv');
  });
});
