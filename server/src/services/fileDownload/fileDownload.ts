import { Worker } from "worker_threads";
import { randomUUID } from "crypto";
import { emitAudioDownloadProgress, emitAudioDownloadFailed, emitAudioDownloadItemFailed, emitAudioDownloadComplete, emitAudioDownloadMetadata } from "../../socket/namespaces/download/audio.js";
import { FileData } from "./downloadFunctions.js";
import { fileURLToPath } from "url";
import { downloadWorkerMessage } from "./types.js";

const activeJobs = new Map();

function generateJobId(): string {
  return randomUUID();
}

/**
 * Downloads audio file in a TypeScript worker thread
 * 
 * Uses a JS resolver pattern to enable TypeScript in worker threads:
 * - JS resolver registers tsx compiler and imports TS worker
 * - Worker performs download in background thread
 */
export async function downloadAudioFile(fileData: FileData): Promise<string> {
  if (!fileData.url) {
    throw new Error(`missing url`);
  }

  const jobId = generateJobId();
  
  // JS resolver enables TypeScript execution in worker thread
  const resolverPath = fileURLToPath(new URL('./downloadWorker.resolver.js', import.meta.url));
  // Actual TypeScript worker implementation, rel to resolver
  const scriptPath = fileURLToPath(new URL('./downloadWorker.ts', import.meta.url));
  
  const worker = new Worker(resolverPath, {
    workerData: { scriptPath, jobId, fileData }
  });

  // Store reference to worker
  activeJobs.set(jobId, {
    worker,
    status: "running",
    fileData,
  });

  // Handle worker messages and cleanup
  worker.on("message", (message: downloadWorkerMessage) => {
    switch (message.type) {
      // Progress from batch downloads
      case "progress":
        emitAudioDownloadProgress(
          jobId,
          message.file,
          message.index,
          message.total
        );
        break;
      case "metadata":
        // Emit metadata for batch downloads
        emitAudioDownloadMetadata(jobId, fileData.folder_id, message.totalFiles);
        break;

      case "item-error":
        // Emit individual item failure to client
        emitAudioDownloadItemFailed(
          jobId,
          fileData.folder_id || 0,
          message.index,
          message.total,
          message.error,
          message.title,
          message.url
        );
        break;

      case "complete":
        emitAudioDownloadComplete(
          jobId,
          fileData.folder_id || 0,
          message.file
        );

        activeJobs.set(jobId, {
          ...activeJobs.get(jobId),
          status: "completed",
        });
        break;

      case "error":
        // Handle worker-level errors
        console.error(`Job ${jobId} worker error:`, message.error);
        emitAudioDownloadFailed(
          jobId,
          fileData.folder_id || 0,
          message.error.message || "Unknown error"
        );

        activeJobs.set(jobId, {
          ...activeJobs.get(jobId),
          status: "failed",
          error: message.error,
        });
    }
  });

  worker.on("error", (err) => {
    console.error(`Job ${jobId} error:`, err);
    emitAudioDownloadFailed(jobId, fileData.folder_id || 0, err.message);

    activeJobs.set(jobId, {
      ...activeJobs.get(jobId),
      status: "failed",
      error: err,
    });
    setTimeout(
      () => {
        activeJobs.delete(jobId);
      },
      1000 * 60 * 60
    );
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Job ${jobId} exited with code ${code}`);
      emitAudioDownloadFailed(jobId, fileData.folder_id || 0, `Worker process exited with code ${code}`);

      activeJobs.set(jobId, {
        ...activeJobs.get(jobId),
        status: "failed",
        error: new Error(`Worker process exited with code ${code}`),
      });
    }
    setTimeout(
      () => {
        activeJobs.delete(jobId);
      },
      1000 * 60 * 60
    );
  });

  return jobId;
}
