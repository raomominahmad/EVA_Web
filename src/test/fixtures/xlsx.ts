import { buildZip } from './zip';
import type { ZipEntryInput } from './zip';

/**
 * Test-only `.xlsx` writer producing real Office Open XML workbooks, so the import pipeline and
 * `read-excel-file` are exercised against genuine files.
 */
export type XlsxCell =
  | number
  | string
  | boolean
  | null
  | { formula: string; cached?: number | string }
  | { error: string }
  | { date: number };

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** 1-based row of the first row in `rows` (default 1). */
  startRow?: number;
  /** 0-based column index of the first cell in each row (default 0 = column A). */
  startColumn?: number;
}

export interface XlsxOptions {
  /** Extra archive entries, e.g. padding to exceed entry limits. */
  extraEntries?: ZipEntryInput[];
  /** Transforms each generated entry, e.g. to falsify sizes. */
  mapEntry?: (entry: ZipEntryInput) => ZipEntryInput;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function columnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function buildXlsx(sheets: XlsxSheet[], options: XlsxOptions = {}): Uint8Array {
  const sharedStrings: string[] = [];
  const stringIndex = (text: string) => {
    const existing = sharedStrings.indexOf(text);
    if (existing !== -1) return existing;
    sharedStrings.push(text);
    return sharedStrings.length - 1;
  };

  const sheetXml = sheets.map((sheet) => {
    const startRow = sheet.startRow ?? 1;
    const startColumn = sheet.startColumn ?? 0;
    const rows = sheet.rows
      .map((row, rowIndex) => {
        const rowNumber = startRow + rowIndex;
        const cells = row
          .map((cell, cellIndex) => {
            const ref = `${columnName(startColumn + cellIndex)}${rowNumber}`;
            if (cell === null) return '';
            if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
            if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
            if (typeof cell === 'string') {
              return `<c r="${ref}" t="s"><v>${stringIndex(cell)}</v></c>`;
            }
            if ('error' in cell) return `<c r="${ref}" t="e"><v>${escapeXml(cell.error)}</v></c>`;
            if ('date' in cell) return `<c r="${ref}" s="1"><v>${cell.date}</v></c>`;
            const formula = `<f>${escapeXml(cell.formula)}</f>`;
            if (cell.cached === undefined) return `<c r="${ref}">${formula}</c>`;
            return typeof cell.cached === 'number'
              ? `<c r="${ref}">${formula}<v>${cell.cached}</v></c>`
              : `<c r="${ref}" t="str">${formula}<v>${escapeXml(cell.cached)}</v></c>`;
          })
          .join('');
        return `<row r="${rowNumber}">${cells}</row>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });

  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const entries: ZipEntryInput[] = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join(
          '',
        )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="${relNs}"><sheets>${sheets
        .map(
          (sheet, index) =>
            `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="${relNs}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rIdS" Type="${relNs}/styles" Target="styles.xml"/><Relationship Id="rIdT" Type="${relNs}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    },
    ...sheetXml.map((data, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data })),
  ];

  entries.push({
    name: 'xl/sharedStrings.xml',
    data: `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${ns}" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings
      .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
      .join('')}</sst>`,
  });

  const mapped = options.mapEntry ? entries.map(options.mapEntry) : entries;

  return buildZip([...mapped, ...(options.extraEntries ?? [])]);
}
