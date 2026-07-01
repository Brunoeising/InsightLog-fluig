import { ErrorCategoryDefinition } from '@/lib/log-categorizer';
import { ChunkedLogBatch, ChunkedLogSummary, parseLargeLogFile } from '@/lib/log-parser-chunked';

type WorkerRequest = {
  type: 'PARSE_FILE';
  file: File;
  categories: ErrorCategoryDefinition[];
};

type WorkerResponse =
  | { type: 'PROGRESS'; parsedBytes: number; totalBytes: number; percent: number }
  | { type: 'BATCH_READY'; batch: ChunkedLogBatch }
  | { type: 'COMPLETE'; summary: ChunkedLogSummary }
  | { type: 'ERROR'; error: string };

function postMessageToClient(message: WorkerResponse) {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'PARSE_FILE') return;

  try {
    const summary = await parseLargeLogFile({
      file: event.data.file,
      categories: event.data.categories,
      onProgress: (progress) => {
        postMessageToClient({ type: 'PROGRESS', ...progress });
      },
      onBatch: async (batch) => {
        postMessageToClient({ type: 'BATCH_READY', batch });
      },
    });

    postMessageToClient({ type: 'COMPLETE', summary });
  } catch (error) {
    postMessageToClient({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Falha ao processar o arquivo localmente.',
    });
  }
};

export {};
