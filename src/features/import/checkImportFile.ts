import { IMPORT_LIMITS } from './importLimits';
import type { ImportFileError, ImportFileKind } from './importTypes';

export type FileCheckResult =
  { ok: true; kind: ImportFileKind } | { ok: false; error: ImportFileError };

export const IMPORT_ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Browsers and operating systems report CSV and XLSX types inconsistently (Windows often reports
// CSV as `application/vnd.ms-excel`), and may report nothing. The type is therefore only used to
// reject clear mismatches; file content is verified in the worker.
const ALLOWED_TYPES: Record<ImportFileKind, readonly string[]> = {
  csv: [
    'text/csv',
    'text/plain',
    'text/x-csv',
    'text/comma-separated-values',
    'application/csv',
    'application/x-csv',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
  ],
};

const UNSUPPORTED: ImportFileError = {
  code: 'unsupportedType',
  message: 'This file type is not supported. Choose a .csv or .xlsx file.',
};

/** Checks extension, reported type, and size before any file content is read. */
export function checkImportFile(file: Pick<File, 'name' | 'size' | 'type'>): FileCheckResult {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  const kind: ImportFileKind | null =
    extension === 'csv' ? 'csv' : extension === 'xlsx' ? 'xlsx' : null;

  if (!kind) {
    return { ok: false, error: UNSUPPORTED };
  }

  const type = file.type.trim().toLowerCase();
  if (type !== '' && !ALLOWED_TYPES[kind].includes(type)) {
    return { ok: false, error: UNSUPPORTED };
  }

  if (file.size === 0) {
    return { ok: false, error: { code: 'empty', message: 'This file is empty.' } };
  }

  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    return {
      ok: false,
      error: {
        code: 'tooLarge',
        message:
          'This file is larger than 1 MiB (1,048,576 bytes). Import files must be 1 MiB or smaller.',
      },
    };
  }

  return { ok: true, kind };
}
