/** Project metadata exactly as entered. Optional fields are empty strings when not provided. */
export interface ProjectDetails {
  name: string;
  description: string;
  manager: string;
  /** `YYYY-MM-DD` from a date input, or an empty string when not provided. */
  reportingDate: string;
}

export const EMPTY_PROJECT_DETAILS: ProjectDetails = {
  name: '',
  description: '',
  manager: '',
  reportingDate: '',
};

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_MANAGER_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 1000;

export type ProjectDetailsField = keyof ProjectDetails;

export type ProjectValidationErrors = Partial<Record<ProjectDetailsField, string>>;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in `YYYY-MM-DD` form, e.g. rejects `2026-02-30`. */
export function isIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Validates project details. Only the project name is required; values are never trimmed or
 * otherwise altered here — whitespace-only names are simply treated as blank.
 */
export function validateProjectDetails(details: ProjectDetails): ProjectValidationErrors {
  const errors: ProjectValidationErrors = {};

  if (details.name.trim() === '') {
    errors.name = 'Enter a project name.';
  } else if (details.name.length > PROJECT_NAME_MAX_LENGTH) {
    errors.name = `Use ${PROJECT_NAME_MAX_LENGTH} characters or fewer for the project name.`;
  }

  if (details.manager.length > PROJECT_MANAGER_MAX_LENGTH) {
    errors.manager = `Use ${PROJECT_MANAGER_MAX_LENGTH} characters or fewer for the project manager.`;
  }

  if (details.description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Use ${PROJECT_DESCRIPTION_MAX_LENGTH} characters or fewer for the description.`;
  }

  if (details.reportingDate !== '' && !isIsoCalendarDate(details.reportingDate)) {
    errors.reportingDate = 'Enter a valid reporting date, or leave it blank.';
  }

  return errors;
}

/** Formats a `YYYY-MM-DD` date for display, e.g. `March 31, 2026`, without time-zone shifts. */
export function formatReportingDate(value: string): string | null {
  if (!isIsoCalendarDate(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)),
  );
}
