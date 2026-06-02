import fs from "node:fs/promises";
import { mock } from "node:test";
import { workerData } from "node:worker_threads";
import { URL } from "node:url";
import ytDlp from "yt-dlp-exec";

// Keep real worker loading, file IO, and shutdown; replace external DB/network calls.
const compiled = workerData.compiled;
const sourceRoot = compiled ? "../../dist/server/src/" : "../../src/";
const { audioPool } = await import(new URL(sourceRoot + "db.js", import.meta.url).href);
const { default: fileService } = await import(new URL(sourceRoot + "api/audio/files/fileService.js", import.meta.url).href);
const { default: fileModel } = await import(new URL(sourceRoot + "api/audio/files/fileModel.js", import.meta.url).href);
let recordId = 0;
const records = new Map();

mock.method(audioPool, "execute", async (_query, parameters) => {
  if (workerData.invalidFolder) return [[]];
  const id = parameters[0];
  return [[{
    id,
    name: id === 1 ? "audio" : workerData.folderName,
    parent_id: id === 1 ? null : 1,
  }]];
});
mock.method(fileService, "insertAudioFiles", async (files) => {
  const id = ++recordId;
  records.set(id, { ...files[0], id, audio_type: "any" });
  return { insertId: id, affectedRows: 1 };
});
mock.method(fileModel, "getAudioFile", async (id) => records.get(id));
mock.method(globalThis, "fetch", async () => new globalThis.Response("fixture audio", {
  headers: { "content-type": "audio/mpeg" },
}));
mock.method(globalThis.console, "warn", () => {});
mock.method(ytDlp, "exec", async (url, flags) => {
    if (!flags.output) return { stdout: JSON.stringify({
      entries: [{ id: "slow", title: "Same" }, { id: "fast", title: "Same" }, null],
    }) };
    if (url.includes("slow")) await new Promise((resolve) => globalThis.setTimeout(resolve, 30));
    await fs.writeFile(flags.output.replace("%(ext)s", "m4a"), url);
    return { stdout: JSON.stringify({ title: "Same", duration: 1 }) };
  });

await import(new URL(sourceRoot + "services/fileDownload/downloadWorker.js", import.meta.url).href);
