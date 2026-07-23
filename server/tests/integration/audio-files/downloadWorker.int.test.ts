import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";
import { serverConfig } from "../../../src/config/server-config.js";
import { runWorker } from "../../fixtures/downloadWorkerHelpers.js";

test("compiled worker runs without a copied TS resolver or TS worker in dist", async () => {
  const messages = await runWorker({ compiled: true });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "complete");
  if (messages[0].type !== "complete") return;
  await fs.access(path.join(serverConfig.publicDir, messages[0].file!.rel_path!));
});
