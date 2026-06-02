import { Worker } from "worker_threads";
import { randomUUID } from "crypto";
import { emitAudioDownloadProgress, emitAudioDownloadFailed, emitAudioDownloadItemFailed, emitAudioDownloadComplete, emitAudioDownloadMetadata } from "../../socket/namespaces/download/audio.js";
import { FileData } from "./downloadFunctions.js";
import { fileURLToPath } from "url";
import { downloadWorkerMessage } from "./types.js";
import { FOLDERS } from "../../api/audio/folders/constants.js";

const activeJobs = new Map<string, Worker>();

function generateJobId(): string {
  return randomUUID();
}

/**
 * Download audio in a worker thread, using the TS resolver during development
 * and the emitted JavaScript worker in production.
 */
export async function downloadAudioFile(fileData: FileData): Promise<string> {
  if (!fileData.url) throw new Error("Missing URL");
  fileData = { ...fileData, folder_id: fileData.folder_id || FOLDERS.UPLOAD };
  const jobId = generateJobId();

  // Built servers run the emitted JS directly; development uses the TS resolver.
  const development = import.meta.url.endsWith(".ts");
  const workerPath = new URL(development ? "./downloadWorker.resolver.js" : "./downloadWorker.js", import.meta.url);
  const scriptPath = fileURLToPath(new URL("./downloadWorker.ts", import.meta.url));
  const worker = new Worker(workerPath, {
    workerData: { scriptPath, jobId, fileData },
  });
  activeJobs.set(jobId, worker);
  let finished = false;

  const fail = (error: string) => {
    if (finished) return;
    finished = true;
    console.error(`Job ${jobId} failed:`, error);
    emitAudioDownloadFailed(jobId, fileData.folder_id, error);
  };

  worker.on("message", (message: downloadWorkerMessage) => {
    if (finished) return;
    switch (message.type) {
      case "progress":
        emitAudioDownloadProgress(jobId, message.file, message.index, message.total);
        break;
      case "metadata":
        emitAudioDownloadMetadata(jobId, fileData.folder_id, message.totalFiles);
        break;
      case "item-error":
        emitAudioDownloadItemFailed(jobId, fileData.folder_id, message.index,
          message.total, message.error, message.title, message.url);
        break;
      case "complete":
        finished = true;
        emitAudioDownloadComplete(jobId, fileData.folder_id, message.file);
        break;
      case "error":
        fail(message.error.message || "Unknown error");
        break;
    }
  });

  worker.on("error", (error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
  });
  worker.on("exit", (code) => {
    if (!finished) fail(`Download worker exited without completing (code ${code})`);
    activeJobs.delete(jobId);
  });

  return jobId;
}
