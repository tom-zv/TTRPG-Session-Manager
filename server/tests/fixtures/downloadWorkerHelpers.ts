import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { serverConfig } from "../../src/config/server-config.js";
import type { downloadWorkerMessage } from "../../src/services/fileDownload/types.js";

export let directory: string;

beforeEach(async () => {
  await fs.mkdir(serverConfig.audioDir, { recursive: true });
  directory = await fs.mkdtemp(path.join(serverConfig.audioDir, "worker-test-"));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

export async function runWorker(options: { compiled?: boolean; playlist?: boolean; invalidFolder?: boolean } = {}) {
  const harness = new URL("./downloadWorkerHarness.mjs", import.meta.url);
  const worker = new Worker(options.compiled ? harness :
    new URL("../../src/services/fileDownload/downloadWorker.resolver.js", import.meta.url), {
    ...(options.compiled ? { execArgv: [] } : {}),
    workerData: {
      scriptPath: fileURLToPath(harness),
      jobId: "test-job",
      folderName: path.basename(directory),
      fileData: {
        name: "Worker Track",
        // Omitting folder_id exercises the worker's own upload-folder fallback.
        url: options.playlist ? "https://www.youtube.com/playlist?list=123" : "https://example.com/audio.mp3",
      },
      ...options,
    },
  });
  const messages: downloadWorkerMessage[] = [];
  worker.on("message", (message) => messages.push(message));
  return new Promise<downloadWorkerMessage[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Download worker did not exit after finishing"));
    }, 10000);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error("Worker exited with code " + code));
      else resolve(messages);
    });
  });
}

