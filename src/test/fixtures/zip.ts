/// <reference types="node" />
import { deflateRawSync } from 'node:zlib';

/** Test-only ZIP writer. Supports stored and deflated entries and falsified headers for limits. */
export interface ZipEntryInput {
  name: string;
  data: Uint8Array | string;
  /** 0 = stored, 8 = deflated (default). */
  method?: 0 | 8;
  /** Overrides the uncompressed size written to the headers (to simulate a lying archive). */
  declaredSize?: number;
  /** Sets general-purpose flag bit 0 (traditional encryption). */
  encrypted?: boolean;
}

const encoder = new TextEncoder();

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(entries: ZipEntryInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const method = entry.method ?? 8;
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const size = entry.declaredSize ?? raw.length;
    const flags = (entry.encrypted ? 1 : 0) | 0x0800;
    const crc = crc32(raw);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, compressed.length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, compressed);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, flags, true);
    header.setUint16(10, method, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, compressed.length, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    central.push(new Uint8Array(header.buffer), name);

    offset += 30 + name.length + compressed.length;
  }

  const centralSize = central.reduce((total, chunk) => total + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}
