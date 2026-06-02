import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { serverConfig } from "../src/config/server-config.js";
import type { downloadWorkerMessage } from "../src/services/fileDownload/types.js";

let directory: string;

beforeEach(async () => {
  await fs.mkdir(serverConfig.audioDir, { recursive: true });
  directory = await fs.mkdtemp(path.join(serverConfig.audioDir, "worker-test-"));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

async function runWorker(options: { compiled?: boolean; playlist?: boolean; invalidFolder?: boolean } = {}) {
  const harness = new URL("./fixtures/downloadWorkerHarness.mjs", import.meta.url);
  const worker = new Worker(options.compiled ? harness :
    new URL("../src/services/fileDownload/downloadWorker.resolver.js", import.meta.url), {
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

test("development worker ingests into the default folder and exits after completion", async () => {
  const messages = await runWorker();
  assert.equal(messages.length, 1);
  const complete = messages[0];
  assert.equal(complete.type, "complete");
  if (complete.type !== "complete") return;
  assert.equal(complete.file?.folder_id, 5);
  assert.equal(path.basename(complete.file!.rel_path!), "Worker Track.mp3");
  assert.equal(await fs.readFile(path.join(serverConfig.publicDir, complete.file!.rel_path!), "utf8"), "fixture audio");
});

test("playlist progress counts completed items monotonically and reports invalid entries", async () => {
  const messages = await runWorker({ playlist: true });
  const outcomes = messages.filter((message) => message.type === "progress" || message.type === "item-error");
  assert.deepEqual(outcomes.map((message) => message.index), [1, 2, 3]);
  assert.equal(outcomes.filter((message) => message.type === "item-error").length, 1);
  assert.equal(messages.at(-1)?.type, "complete");
  assert.equal((await fs.readdir(directory)).length, 2);
});

test("invalid folders emit one error and no completion or leftover file", async () => {
  const messages = await runWorker({ invalidFolder: true });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "error");
  assert.deepEqual(await fs.readdir(directory), []);
});

test("compiled worker runs without a copied TS resolver or TS worker in dist", async () => {
  const messages = await runWorker({ compiled: true });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "complete");
  if (messages[0].type !== "complete") return;
  await fs.access(path.join(serverConfig.publicDir, messages[0].file!.rel_path!));
});
