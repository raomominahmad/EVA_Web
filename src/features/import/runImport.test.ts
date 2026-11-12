import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkImportFile } from './checkImportFile';
import { ImportAbortedError, runImport } from './runImport';
import type { ImportWorkerLike, ImportWorkerRequest, ImportWorkerResponse } from './runImport';

class FakeWorker implements ImportWorkerLike {
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  received: ImportWorkerRequest | null = null;
  receivedAt = 0;
  terminated = false;

  postMessage(message: ImportWorkerRequest): void {
    this.received = message;
    this.receivedAt = Date.now();
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: ImportWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<ImportWorkerResponse>);
  }
}

function file(name: string, content = 'BAC\n1', type = '') {
  return new File([content], name, { type });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('checkImportFile', () => {
  it('accepts .csv and .xlsx in any letter case', () => {
    expect(checkImportFile(file('a.CSV'))).toEqual({ ok: true, kind: 'csv' });
    expect(checkImportFile(file('a.xlsx', 'x'))).toEqual({ ok: true, kind: 'xlsx' });
  });

  it('rejects other extensions, including legacy and macro-enabled workbooks', () => {
    for (const name of ['a.xls', 'a.xlsm', 'a.ods', 'a.txt', 'a', 'a.csv.exe']) {
      expect(checkImportFile(file(name))).toMatchObject({
        ok: false,
        error: { code: 'unsupportedType' },
      });
    }
  });

  it('accepts common reported types and rejects clear mismatches', () => {
    expect(checkImportFile(file('a.csv', 'x', 'application/vnd.ms-excel')).ok).toBe(true);
    expect(checkImportFile(file('a.csv', 'x', 'image/png')).ok).toBe(false);
    expect(checkImportFile(file('a.xlsx', 'x', 'text/csv')).ok).toBe(false);
  });

  it('rejects empty files and files over 1 MiB, and accepts exactly 1 MiB', () => {
    expect(checkImportFile({ name: 'a.csv', size: 0, type: '' })).toMatchObject({
      ok: false,
      error: { code: 'empty' },
    });
    expect(checkImportFile({ name: 'a.csv', size: 1_048_576, type: '' }).ok).toBe(true);
    expect(checkImportFile({ name: 'a.csv', size: 1_048_577, type: '' })).toMatchObject({
      ok: false,
      error: {
        code: 'tooLarge',
        message:
          'This file is larger than 1 MiB (1,048,576 bytes). Import files must be 1 MiB or smaller.',
      },
    });
  });
});

describe('runImport', () => {
  it('rejects a failing file before reading it or starting a worker', async () => {
    const createWorker = vi.fn(() => new FakeWorker());
    const big = new File([new Uint8Array(1_048_577)], 'big.csv');
    await expect(runImport(big, { createWorker })).resolves.toMatchObject({
      ok: false,
      error: { code: 'tooLarge' },
    });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('sends the file to a worker and terminates it after the result', async () => {
    const worker = new FakeWorker();
    const pending = runImport(file('costs.csv'), { createWorker: () => worker });

    await vi.waitFor(() => expect(worker.received).not.toBeNull());
    expect(worker.received).toMatchObject({ kind: 'csv', fileName: 'costs.csv' });

    const result = { ok: false, error: { code: 'noDataRows', message: 'x' } } as const;
    worker.respond({ result });
    await expect(pending).resolves.toEqual(result);
    expect(worker.terminated).toBe(true);
  });

  it('terminates a worker that exceeds the time limit and reports a timeout', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const pending = runImport(file('slow.xlsx', 'x'), { createWorker: () => worker });

    // vi.waitFor advances fake timers while polling, so measure from when the worker started.
    await vi.waitFor(() => expect(worker.received).not.toBeNull());
    const elapsed = Date.now() - worker.receivedAt;
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(9_999 - elapsed);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      ok: false,
      error: {
        code: 'timeout',
        message:
          'Reading this file took too long. Save only the EVA values in a new file and try again.',
      },
    });
    expect(worker.terminated).toBe(true);

    // A late answer from a terminated worker is ignored.
    worker.respond({ result: { ok: false, error: { code: 'empty', message: 'late' } } });
  });

  it('terminates the worker when cancelled', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = runImport(file('a.csv'), {
      createWorker: () => worker,
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(worker.received).not.toBeNull());
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ImportAbortedError);
    expect(worker.terminated).toBe(true);
  });

  it('reports a worker crash as an unreadable file', async () => {
    const worker = new FakeWorker();
    const pending = runImport(file('a.csv'), { createWorker: () => worker });
    await vi.waitFor(() => expect(worker.received).not.toBeNull());
    worker.onerror?.(new ErrorEvent('error'));
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'unreadable' } });
    expect(worker.terminated).toBe(true);
  });
});
