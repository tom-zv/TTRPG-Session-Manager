import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";
import { serverConfig } from "../../../src/config/server-config.js";
import { directory, runWorker } from "../../fixtures/downloadWorkerHelpers.js";

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

