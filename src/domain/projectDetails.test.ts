import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROJECT_DETAILS,
  formatReportingDate,
  isIsoCalendarDate,
  PROJECT_NAME_MAX_LENGTH,
  validateProjectDetails,
} from './projectDetails';
import type { ProjectDetails } from './projectDetails';

function details(overrides: Partial<ProjectDetails> = {}): ProjectDetails {
  return { ...EMPTY_PROJECT_DETAILS, name: 'Billing platform', ...overrides };
}

describe('validateProjectDetails', () => {
  it('accepts a project name with every optional field blank', () => {
    expect(validateProjectDetails(details())).toEqual({});
  });

  it('requires a project name and treats whitespace as blank', () => {
    expect(validateProjectDetails(details({ name: '' }))).toEqual({
      name: 'Enter a project name.',
    });
    expect(validateProjectDetails(details({ name: '   ' })).name).toBe('Enter a project name.');
  });

  it('limits the project name length', () => {
    expect(validateProjectDetails(details({ name: 'x'.repeat(PROJECT_NAME_MAX_LENGTH) }))).toEqual(
      {},
    );
    expect(
      validateProjectDetails(details({ name: 'x'.repeat(PROJECT_NAME_MAX_LENGTH + 1) })).name,
    ).toMatch(/characters or fewer/);
  });

  it('accepts commas, quotes, and line breaks in metadata', () => {
    expect(
      validateProjectDetails(
        details({ name: 'Phase "A", core', description: 'Line one,\nline "two"' }),
      ),
    ).toEqual({});
  });

  it('accepts a blank or valid reporting date and rejects an invalid one', () => {
    expect(validateProjectDetails(details({ reportingDate: '2026-03-31' }))).toEqual({});
    expect(validateProjectDetails(details({ reportingDate: '2026-02-30' })).reportingDate).toBe(
      'Enter a valid reporting date, or leave it blank.',
    );
  });
});

describe('isIsoCalendarDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoCalendarDate('2024-02-29')).toBe(true);
    expect(isIsoCalendarDate('2026-02-29')).toBe(false);
    expect(isIsoCalendarDate('2026-13-01')).toBe(false);
    expect(isIsoCalendarDate('31/03/2026')).toBe(false);
    expect(isIsoCalendarDate('')).toBe(false);
  });
});

describe('formatReportingDate', () => {
  it('formats the calendar date without shifting it across time zones', () => {
    expect(formatReportingDate('2026-03-31')).toBe('March 31, 2026');
    expect(formatReportingDate('2026-01-01')).toBe('January 1, 2026');
  });

  it('returns null for a blank or invalid date', () => {
    expect(formatReportingDate('')).toBeNull();
    expect(formatReportingDate('not a date')).toBeNull();
  });
});
