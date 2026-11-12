import { checkImportFile } from './checkImportFile';
import { IMPORT_LIMITS } from './importLimits';
import type { ImportFileKind, ImportResult } from './importTypes';

export interface ImportWorkerRequest {
  kind: ImportFileKind;
  buffer: ArrayBuffer;
  fileName: string;
}

export interface ImportWorkerResponse {
  result: ImportResult;
}

/** The subset of `Worker` used here, so tests can supply a fake. */
export interface ImportWorkerLike {
  postMessage(message: ImportWorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface RunImportOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  createWorker?: () => ImportWorkerLike;
}

function createImportWorker(): ImportWorkerLike {
  return new Worker(new URL('./import.worker.ts', import.meta.url), {
    type: 'module',
    name: 'eva-import',
  });
}

export class ImportAbortedError extends Error {
  constructor() {
    super('Import was cancelled');
    this.name = 'ImportAbortedError';
  }
}

/**
 * Checks a file, then parses and validates it in a dedicated Web Worker. The worker is
 * terminated when the time limit passes, when `signal` aborts, or when it finishes, so a slow or
 * hostile file cannot keep running or freeze the page. Rejects only with `ImportAbortedError`.
 */
export async function runImport(file: File, options: RunImportOptions = {}): Promise<ImportResult> {
  const {
    signal,
    timeoutMs = IMPORT_LIMITS.parseTimeoutMs,
    createWorker = createImportWorker,
  } = options;

  const check = checkImportFile(file);
  if (!check.ok) return { ok: false, error: check.error };

  if (signal?.aborted) throw new ImportAbortedError();
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) throw new ImportAbortedError();

  return new Promise<ImportResult>((resolve, reject) => {
    let worker: ImportWorkerLike;

    try {
      worker = createWorker();
    } catch {
      resolve({
        ok: false,
        error: {
          code: 'unreadable',
          message: 'This browser could not start the file reader. Enter the values manually.',
        },
      });
      return;
    }

    let settled = false;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      outcome();
    };

    const onAbort = () => finish(() => reject(new ImportAbortedError()));

    const timer = setTimeout(() => {
      finish(() =>
        resolve({
          ok: false,
          error: {
            code: 'timeout',
            message:
              'Reading this file took too long. Save only the EVA values in a new file and try again.',
          },
        }),
      );
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event) => finish(() => resolve(event.data.result));
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() =>
        resolve({
          ok: false,
          error: { code: 'unreadable', message: 'The file could not be read.' },
        }),
      );
    };

    worker.postMessage({ kind: check.kind, buffer, fileName: file.name }, [buffer]);
  });
}
