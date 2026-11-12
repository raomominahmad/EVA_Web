import type { RawCell } from '../importTypes';

/**
 * Small, application-owned readers for the parts of an Office Open XML workbook that
 * `read-excel-file` does not expose: the first worksheet's name and path, and cells whose stored
 * content is an error value or a formula without a calculated value (both of which the library
 * reports as empty).
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity: string, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function attribute(tag: string, name: string): string | null {
  // Matches `name="…"` or `prefix:name="…"`, with either quote style.
  const pattern = new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const match = pattern.exec(tag);
  if (!match) return null;
  return decodeXmlText(match[2] ?? match[3] ?? '');
}

export interface FirstWorksheet {
  name: string;
  /** Archive path, e.g. `xl/worksheets/sheet1.xml`. */
  path: string;
}

/** Resolves a relationship target relative to `xl/`, as used by `xl/_rels/workbook.xml.rels`. */
function resolveTarget(target: string): string {
  const raw = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const parts: string[] = [];

  for (const part of raw.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }

  return parts.join('/');
}

/** Finds the first worksheet in workbook order, or `null` if it cannot be resolved. */
export function findFirstWorksheet(
  workbookXml: string,
  relationshipsXml: string,
): FirstWorksheet | null {
  const sheetTag = /<(?:[\w.-]+:)?sheet\b[^>]*>/.exec(workbookXml)?.[0];
  if (!sheetTag) return null;

  const name = attribute(sheetTag, 'name');
  const relationshipId = attribute(sheetTag, 'id');
  if (name === null || relationshipId === null) return null;

  for (const match of relationshipsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*>/g)) {
    const tag = match[0];
    if (attribute(tag, 'Id') === relationshipId) {
      const target = attribute(tag, 'Target');
      return target === null ? null : { name, path: resolveTarget(target) };
    }
  }

  return null;
}

/**
 * Returns cells, keyed by reference (for example `C4`), whose stored content is an error value
 * or a formula without a stored result. Cells without an `r` attribute cannot be located and are
 * left to the regular reader.
 */
export function scanSpecialCells(worksheetXml: string): Map<string, RawCell> {
  const special = new Map<string, RawCell>();
  const cellPattern = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;

  for (const match of worksheetXml.matchAll(cellPattern)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const ref = attribute(attributes, 'r');
    if (ref === null) continue;

    const valueMatch = /<(?:[\w.-]+:)?v>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(body);
    const value = valueMatch ? decodeXmlText(valueMatch[1] ?? '') : null;

    if (attribute(attributes, 't') === 'e') {
      special.set(ref.toUpperCase(), { kind: 'error', code: value?.trim() || '#ERROR' });
      continue;
    }

    const hasFormula = /<(?:[\w.-]+:)?f\b/.test(body);
    if (hasFormula && (value === null || value === '')) {
      special.set(ref.toUpperCase(), { kind: 'formulaWithoutValue' });
    }
  }

  return special;
}

/** Converts a 0-based column index and 1-based row number to a cell reference such as `B3`. */
export function cellReference(columnIndex: number, rowNumber: number): string {
  let name = '';
  let n = columnIndex + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return `${name}${rowNumber}`;
}
