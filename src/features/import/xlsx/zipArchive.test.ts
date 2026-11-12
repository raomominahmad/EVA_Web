import { describe, expect, it } from 'vitest';
import { buildZip } from '@/test/fixtures/zip';
import type { ZipEntryInput } from '@/test/fixtures/zip';
import { inspectZipArchive, isZipSignature, readZipEntry } from './zipArchive';

const WORKBOOK: ZipEntryInput[] = [
  { name: '[Content_Types].xml', data: '<Types/>' },
  { name: 'xl/workbook.xml', data: '<workbook/>' },
  { name: 'xl/worksheets/sheet1.xml', data: '<worksheet/>' },
];

function violation(bytes: Uint8Array) {
  const result = inspectZipArchive(bytes);
  return result.ok ? null : result.violation;
}

/** Rewrites the compression method in every central directory header. */
function withCentralMethod(bytes: Uint8Array, method: number): Uint8Array {
  const copy = bytes.slice();
  const view = new DataView(copy.buffer);
  for (let offset = 0; offset + 4 <= copy.length; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) view.setUint16(offset + 10, method, true);
  }
  return copy;
}

describe('inspectZipArchive', () => {
  it('lists the entries of a valid workbook archive without decompressing them', () => {
    const result = inspectZipArchive(buildZip(WORKBOOK));
    expect(result.ok && result.entries.map((entry) => entry.name)).toEqual(
      WORKBOOK.map((entry) => entry.name),
    );
  });

  it('rejects non-ZIP and truncated data', () => {
    const text = new TextEncoder().encode('BAC,PV,EV,AC');
    expect(isZipSignature(text)).toBe(false);
    expect(violation(text)).toBe('notZip');

    const archive = buildZip(WORKBOOK);
    expect(isZipSignature(archive)).toBe(true);
    expect(violation(archive.slice(0, archive.length - 10))).not.toBeNull();
  });

  it('rejects ZIP64 size markers', () => {
    expect(
      violation(buildZip([...WORKBOOK, { name: 'big', data: 'x', declaredSize: 0xffffffff }])),
    ).toBe('zip64');
  });

  it('rejects compression methods other than stored and deflate', () => {
    expect(violation(withCentralMethod(buildZip(WORKBOOK), 12))).toBe('unsupportedCompression');
  });

  it('rejects archives that are not workbooks', () => {
    expect(violation(buildZip(WORKBOOK.filter((entry) => entry.name !== 'xl/workbook.xml')))).toBe(
      'notWorkbook',
    );
  });

  it('applies the ratio limit only to entries above 64 KiB', () => {
    // 60 KB of zeros compresses far beyond 200:1 but is too small to matter.
    expect(violation(buildZip([...WORKBOOK, { name: 'z', data: new Uint8Array(60_000) }]))).toBe(
      null,
    );
  });
});

describe('readZipEntry', () => {
  it('reads stored and deflated entries', async () => {
    const bytes = buildZip([
      ...WORKBOOK,
      { name: 'stored.txt', data: 'plain', method: 0 },
      { name: 'deflated.txt', data: 'packed' },
    ]);
    const result = inspectZipArchive(bytes);
    if (!result.ok) throw new Error(result.violation);
    const decoded = await Promise.all(
      result.entries
        .slice(WORKBOOK.length)
        .map(async (entry) => new TextDecoder().decode(await readZipEntry(bytes, entry, 1_000))),
    );
    expect(decoded).toEqual(['plain', 'packed']);
  });
});
