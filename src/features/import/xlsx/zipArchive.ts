import { IMPORT_LIMITS } from '../importLimits';

/**
 * Minimal, defensive ZIP reader for `.xlsx` safeguards (`docs/DECISIONS.md` §8.2). It reads only
 * the central directory to enforce limits before any decompression, and decompresses individual
 * entries with a hard cap on the bytes actually produced.
 */

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export type ZipLimitViolation =
  | 'notZip'
  | 'truncated'
  | 'zip64'
  | 'multiDisk'
  | 'tooManyEntries'
  | 'encrypted'
  | 'unsupportedCompression'
  | 'entryTooLarge'
  | 'totalTooLarge'
  | 'compressionRatio'
  | 'tooManyWorksheets'
  | 'noWorksheets'
  | 'notWorkbook';

export type ZipInspection =
  { ok: true; entries: ZipEntry[] } | { ok: false; violation: ZipLimitViolation };

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const MAX_COMMENT_LENGTH = 0xffff;
const WORKSHEET_PATH = /^xl\/worksheets\/[^/]+\.xml$/;

const nameDecoder = new TextDecoder('utf-8');

function fail(violation: ZipLimitViolation): ZipInspection {
  return { ok: false, violation };
}

function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - 22 - MAX_COMMENT_LENGTH);

  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  return -1;
}

export function isZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Validates archive structure and every approved limit without decompressing anything. */
export function inspectZipArchive(bytes: Uint8Array): ZipInspection {
  const limits = IMPORT_LIMITS.zip;

  if (!isZipSignature(bytes) || bytes.length < 22) {
    return fail('notZip');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);

  if (eocd < 0) {
    return fail('truncated');
  }

  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_END_LOCATOR) {
    return fail('zip64');
  }

  const diskNumber = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    return fail('zip64');
  }

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    return fail('multiDisk');
  }

  if (entryCount > limits.maxEntries) {
    return fail('tooManyEntries');
  }

  if (centralOffset + centralSize > eocd) {
    return fail('truncated');
  }

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_DIRECTORY_HEADER) {
      return fail('truncated');
    }

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameEnd = offset + 46 + nameLength;

    if (nameEnd > eocd) {
      return fail('truncated');
    }

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      return fail('zip64');
    }

    // Bit 0: traditional encryption. Bit 6: strong encryption.
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      return fail('encrypted');
    }

    if (method !== 0 && method !== 8) {
      return fail('unsupportedCompression');
    }

    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      return fail('entryTooLarge');
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      return fail('totalTooLarge');
    }

    if (
      uncompressedSize > limits.ratioCheckMinBytes &&
      uncompressedSize / Math.max(compressedSize, 1) > limits.maxCompressionRatio
    ) {
      return fail('compressionRatio');
    }

    if (localHeaderOffset + 30 > centralOffset) {
      return fail('truncated');
    }

    entries.push({
      name: nameDecoder.decode(bytes.subarray(offset + 46, nameEnd)),
      method,
      flags,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset = nameEnd + extraLength + commentLength;
  }

  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) {
    return fail('notWorkbook');
  }

  const worksheetCount = entries.filter((entry) => WORKSHEET_PATH.test(entry.name)).length;
  if (worksheetCount === 0) {
    return fail('noWorksheets');
  }
  if (worksheetCount > limits.maxWorksheets) {
    return fail('tooManyWorksheets');
  }

  return { ok: true, entries };
}

export class ZipEntryError extends Error {
  readonly reason: 'truncated' | 'tooLarge' | 'corrupt';

  constructor(reason: 'truncated' | 'tooLarge' | 'corrupt') {
    super(`ZIP entry could not be read: ${reason}`);
    this.name = 'ZipEntryError';
    this.reason = reason;
  }
}

/**
 * Returns an entry's decompressed bytes, aborting as soon as the output exceeds `maxBytes`. The
 * cap applies to bytes actually produced, so an archive that under-declares sizes is still caught.
 */
export async function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  maxBytes: number,
): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;

  if (header + 30 > bytes.length || view.getUint32(header, true) !== LOCAL_FILE_HEADER) {
    throw new ZipEntryError('truncated');
  }

  const dataStart =
    header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const dataEnd = dataStart + entry.compressedSize;

  if (dataEnd > bytes.length) {
    throw new ZipEntryError('truncated');
  }

  const compressed = bytes.subarray(dataStart, dataEnd);

  if (entry.method === 0) {
    if (compressed.length > maxBytes) throw new ZipEntryError('tooLarge');
    return compressed;
  }

  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(compressed.slice());
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ZipEntryError('tooLarge');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ZipEntryError) throw error;
    throw new ZipEntryError('corrupt');
  }

  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}
