/// <reference lib="webworker" />
import { processImportFile } from './processImportFile';
import type { ImportWorkerRequest, ImportWorkerResponse } from './runImport';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<ImportWorkerRequest>) => {
  const { kind, buffer, fileName } = event.data;

  processImportFile(kind, buffer, fileName)
    .then((result) => {
      scope.postMessage({ result } satisfies ImportWorkerResponse);
    })
    .catch(() => {
      scope.postMessage({
        result: {
          ok: false,
          error: { code: 'unreadable', message: 'The file could not be read.' },
        },
      } satisfies ImportWorkerResponse);
    });
});
