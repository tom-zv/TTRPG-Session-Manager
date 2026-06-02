import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import ytDlp from "yt-dlp-exec";
import fileService from "../src/api/audio/files/fileService.js";
import fileModel from "../src/api/audio/files/fileModel.js";
import { audioPool } from "../src/db.js";
import { getFolderPath } from "../src/api/audio/folders/folderModel.js";
import { downloadAudioUrls } from "../src/api/audio/files/fileController.js";
import { serverConfig } from "../src/config/server-config.js";
import { sanitizeFilename, sanitizeName } from "../src/utils/file-utils.js";
import {
  downloadDirectUrl,
  downloadYouTubeSingle,
  downloadYouTubePlaylist,
  isExplicitYoutubePlaylist,
  isYoutubeUrl,
} from "../src/services/fileDownload/downloadFunctions.js";
import type { AudioFileDB } from "../src/api/audio/types.js";

let directory: string;
let records: AudioFileDB[];
let stagedDirectories: Set<string>;
const request = { name: "", url: "https://example.com/audio.wav?token=123", folder_id: 5 };

// A real one-second PCM WAV exercises music-metadata without network or ffmpeg.
export function wavData(): Buffer {
  const data = Buffer.alloc(44 + 16000);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(16000, 40);
  return data;
}

beforeEach(async () => {
  await fs.mkdir(serverConfig.audioDir, { recursive: true });
  directory = await fs.mkdtemp(path.join(serverConfig.audioDir, "download-test-"));
  records = [];
  stagedDirectories = new Set();
  const mkdtemp = fs.mkdtemp;
  mock.method(fs, "mkdtemp", async (prefix: string) => {
    const created = await mkdtemp(prefix);
    if (prefix.includes("audio-download-")) stagedDirectories.add(created);
    return created;
  });
  mock.method(fileService, "insertAudioFiles", async (files) => {
    const id = records.length + 1;
    records.push({ ...files[0], id, added_at: "", audio_type: "any" } as AudioFileDB);
    return { insertId: id, affectedRows: 1 };
  });
  mock.method(fileModel, "getAudioFile", async (id) => records.find((file) => file.id === id));
  mock.method(globalThis, "fetch", async () => new Response(wavData(), {
    headers: { "content-type": "audio/wav" },
  }));
});

afterEach(async () => {
  mock.restoreAll();
  await fs.rm(directory, { recursive: true, force: true });
  for (const stagedDirectory of stagedDirectories) {
    await assert.rejects(fs.access(stagedDirectory), { code: "ENOENT" });
  }
});

function mockYoutube(title = "Storm: night #1", extension = "m4a") {
  // yt-dlp-exec's default function delegates to its exec method, then parses stdout.
  mock.method(ytDlp as typeof ytDlp & { exec: (...args: unknown[]) => Promise<unknown> },
    "exec", async (_url: string, flags: { output: string }) => {
      const stagedDirectory = path.dirname(flags.output);
      stagedDirectories.add(stagedDirectory);
      await fs.writeFile(flags.output.replace("%(ext)s", extension), "downloaded audio");
      return { stdout: JSON.stringify({ title, duration: 12, _filename: "/original/audio.webm" }) };
    });
}

test("untitled YouTube downloads store the actual sanitized path with its final extension", async () => {
  mockYoutube();
  const file = await downloadYouTubeSingle({ ...request, url: "https://youtu.be/video" }, directory);
  assert.equal(file.name, "Storm_ night 1");
  assert.equal(path.basename(file.rel_path!), "Storm_ night 1.m4a");
  assert.equal(await fs.readFile(path.join(serverConfig.publicDir, file.rel_path!), "utf8"), "downloaded audio");
});

test("custom YouTube titles are sanitized after downloading and cannot become output templates", async () => {
  mockYoutube();
  const file = await downloadYouTubeSingle({ ...request, name: "%(title)s/CON" }, directory);
  assert.equal(file.name, "_(title)s_CON");
  assert.equal(path.basename(file.rel_path!), "_(title)s_CON.m4a");
});

test("concurrent downloads with identical names never overwrite each other", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => new Response("audio-" + ++calls, {
    headers: { "content-type": "audio/mpeg" },
  }));
  mock.method(console, "warn", () => {});
  const files = await Promise.all(Array.from({ length: 4 }, () =>
    downloadDirectUrl({ ...request, name: "Duplicate.mp3" }, directory)));
  assert.equal(new Set(files.map((file) => file.rel_path)).size, 4);
  assert.deepEqual(new Set(await Promise.all(files.map((file) =>
    fs.readFile(path.join(serverConfig.publicDir, file.rel_path!), "utf8")))),
  new Set(["audio-1", "audio-2", "audio-3", "audio-4"]));
  assert(files.every((file) => !file.name.endsWith(".mp3")));
});

test("direct downloads decode RFC 5987 filenames and read real duration", async () => {
  mock.method(globalThis, "fetch", async () => new Response(wavData(), {
    headers: {
      "content-type": "audio/wav; charset=binary",
      "content-disposition": "attachment; filename=\"fallback.wav\"; filename*=UTF-8''Rain%20%26%20wind.wav",
    },
  }));
  const file = await downloadDirectUrl(request, directory);
  assert.equal(file.name, "Rain & wind");
  assert.equal(path.basename(file.rel_path!), "Rain & wind.wav");
  assert.equal(file.duration, 1);
});

test("MIME parameters and dots in custom display names do not become malformed extensions", async () => {
  mock.method(globalThis, "fetch", async () => new Response(wavData(), {
    headers: { "content-type": "audio/x-wav; charset=binary" },
  }));
  const file = await downloadDirectUrl({ ...request, url: "https://example.com/download", name: "Rain.v2" }, directory);
  assert.equal(file.name, "Rain.v2");
  assert.equal(path.basename(file.rel_path!), "Rain.v2.wav");
});

test("percent-encoded URL filenames are decoded", async () => {
  const file = await downloadDirectUrl({ ...request, url: "https://example.com/Night%20rain.wav?sig=abc" }, directory);
  assert.equal(file.name, "Night rain");
});

test("an explicit extension is preserved when an endpoint supplies neither a filename nor a MIME type", async () => {
  mock.method(globalThis, "fetch", async () => new Response(wavData()));
  const file = await downloadDirectUrl({
    ...request, name: "Rain.wav", url: "https://example.com/download",
  }, directory);
  assert.equal(path.basename(file.rel_path!), "Rain.wav");
  assert.equal(file.duration, 1);
});

test("metadata failure does not discard a completed download", async () => {
  mock.method(globalThis, "fetch", async () => new Response("unrecognized audio", {
    headers: { "content-type": "audio/mpeg" },
  }));
  mock.method(console, "warn", () => {});
  const file = await downloadDirectUrl({ ...request, name: "Track" }, directory);
  assert.equal(file.duration, null);
  await fs.access(path.join(serverConfig.publicDir, file.rel_path!));
});

test("a failed DB insert removes only the new file and preserves existing files", async () => {
  await fs.writeFile(path.join(directory, "Track.wav"), "existing audio");
  mock.method(fileService, "insertAudioFiles", async () => { throw new Error("DB unavailable"); });
  await assert.rejects(downloadDirectUrl({ ...request, name: "Track" }, directory), /DB unavailable/);
  assert.deepEqual(await fs.readdir(directory), ["Track.wav"]);
  assert.equal(await fs.readFile(path.join(directory, "Track.wav"), "utf8"), "existing audio");
});

test("failed reads after a successful insert retain the committed file", async () => {
  mock.method(fileModel, "getAudioFile", async () => undefined);
  await assert.rejects(downloadDirectUrl(request, directory), /Failed to retrieve/);
  assert.equal(records.length, 1);
  await fs.access(path.join(serverConfig.publicDir, records[0].rel_path!));
});

test("HTTP stream errors reject instead of leaving a partial library file", async () => {
  mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.error(new Error("Connection dropped"));
    },
  })));
  await assert.rejects(downloadDirectUrl(request, directory), /Connection dropped/);
  assert.deepEqual(await fs.readdir(directory), []);
  assert.equal(records.length, 0);
});

test("a library scan cannot see an audio filename while its bytes are still being copied", async () => {
  let copyStarted!: () => void;
  let finishCopy!: () => void;
  const copying = new Promise<void>((resolve) => { copyStarted = resolve; });
  const release = new Promise<void>((resolve) => { finishCopy = resolve; });
  mock.method(fs, "copyFile", async (source: string, destination: string) => {
    await fs.writeFile(destination, "partial");
    copyStarted();
    await release;
    await fs.writeFile(destination, await fs.readFile(source));
  });
  const download = downloadDirectUrl(request, directory);
  await copying;
  const visibleAudio = (await fs.readdir(directory)).filter((filename) => filename.endsWith(".wav"));
  finishCopy();
  const file = await download;
  assert.deepEqual(visibleAudio, []);
  assert.deepEqual(await fs.readFile(path.join(serverConfig.publicDir, file.rel_path!)), wavData());
  assert.deepEqual(await fs.readdir(directory), ["audio.wav"]);
});

test("HTML responses, empty files, and missing response bodies never enter the library", async () => {
  for (const response of [
    new Response("<html>Error</html>", { headers: { "content-type": "text/html" } }),
    new Response(""),
    new Response(null),
  ]) {
    mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(downloadDirectUrl(request, directory));
  }
  assert.deepEqual(await fs.readdir(directory), []);
  assert.equal(records.length, 0);
});

test("long Unicode names fit the DB and filename limits while preserving the audio extension", async () => {
  const file = await downloadDirectUrl({ ...request, name: "🌧".repeat(100) }, directory);
  assert(Buffer.byteLength(path.basename(file.rel_path!)) <= 255);
  assert(Array.from(file.name).length <= 128);
  assert(file.rel_path!.endsWith(".wav"));
  await fs.access(path.join(serverConfig.publicDir, file.rel_path!));
});

test("sanitization returns the complete filename and refuses to overwrite an existing file", async () => {
  const original = path.join(directory, "Rain#.mp3");
  await fs.writeFile(original, "original");
  const relPath = path.relative(serverConfig.publicDir, original);
  assert.equal(sanitizeFilename(relPath), "Rain.mp3");
  await fs.writeFile(original, "another");
  assert.throws(() => sanitizeFilename(relPath), { code: "EEXIST" });
  assert.equal(await fs.readFile(path.join(directory, "Rain.mp3"), "utf8"), "original");
  assert.equal(sanitizeName("CON"), "_CON");
  assert.equal(sanitizeName("track. "), "track");
});

test("renaming a downloaded file ignores the old path submitted by edit dialogs", async () => {
  const file = await downloadDirectUrl(request, directory);
  const oldPath = file.rel_path!;
  mock.method(fileModel, "updateAudioFile", async (id, params) => {
    Object.assign(records.find((record) => record.id === id)!, params);
    return 1;
  });
  const renamed = await fileService.updateAudioFile(file.id, { name: "New: rain.wav", rel_path: oldPath });
  assert.equal(renamed.name, "New_ rain");
  assert.equal(path.basename(renamed.rel_path!), "New_ rain.wav");
  assert.deepEqual(await fs.readFile(path.join(serverConfig.publicDir, renamed.rel_path!)), wavData());
  await assert.rejects(fs.access(path.join(serverConfig.publicDir, oldPath)), { code: "ENOENT" });
});

test("renaming never overwrites another file or updates the DB when the destination exists", async () => {
  const file = await downloadDirectUrl(request, directory);
  await fs.writeFile(path.join(directory, "Existing.wav"), "existing");
  const update = mock.method(fileModel, "updateAudioFile", async () => 1);
  await assert.rejects(fileService.updateAudioFile(file.id, { name: "Existing" }), /already exists/);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(await fs.readFile(path.join(directory, "Existing.wav"), "utf8"), "existing");
  await fs.access(path.join(serverConfig.publicDir, file.rel_path!));
});

test("failed DB updates leave a renamed download at its original valid path", async () => {
  const file = await downloadDirectUrl(request, directory);
  mock.method(fileModel, "updateAudioFile", async () => { throw new Error("DB unavailable"); });
  await assert.rejects(fileService.updateAudioFile(file.id, { name: "Renamed" }), /DB unavailable/);
  assert.deepEqual(await fs.readdir(directory), ["audio.wav"]);
  await fs.access(path.join(serverConfig.publicDir, file.rel_path!));
});

test("conflicting name and path edits fail before touching the file", async () => {
  const file = await downloadDirectUrl(request, directory);
  await assert.rejects(fileService.updateAudioFile(file.id, {
    name: "New", rel_path: "audio/another.wav",
  }), /change its path independently/);
  assert.deepEqual(await fs.readdir(directory), ["audio.wav"]);
});

test("YouTube dispatch checks the host, and watch URLs with list parameters remain single videos", () => {
  assert(isYoutubeUrl("https://music.youtube.com/watch?v=123"));
  assert(!isYoutubeUrl("https://example.com/youtube.com/audio.mp3"));
  assert(!isYoutubeUrl("https://youtube.com.evil.test/video"));
  assert(isExplicitYoutubePlaylist("https://www.youtube.com/playlist?list=123"));
  assert(!isExplicitYoutubePlaylist("https://www.youtube.com/watch?v=123&list=456"));
});

test("missing and circular folder hierarchies fail instead of returning a partial path", async () => {
  mock.method(audioPool, "execute", async () => [[]]);
  await assert.rejects(getFolderPath(99), /does not exist/);
  mock.method(audioPool, "execute", async () => [[{ id: 9, parent_id: 9, name: "loop" }]]);
  await assert.rejects(getFolderPath(9), /Circular folder hierarchy/);
});

test("the download endpoint accepts signed URLs and extensionless URLs, and rejects invalid input", async () => {
  async function validationError(files: unknown[]) {
    let error: unknown;
    await downloadAudioUrls(
      { body: { files } } as Parameters<typeof downloadAudioUrls>[0],
      {} as Parameters<typeof downloadAudioUrls>[1],
      (value?: unknown) => { error = value; }
    );
    assert(error instanceof Error);
    return error.message;
  }
  for (const url of ["https://example.com/audio.wav?sig=abc", "https://example.com/download"]) {
    assert.match(await validationError([
      { ...request, url }, { ...request, name: "sentinel", url: "not a URL" },
    ]), /Invalid URL for file "sentinel"/);
  }
  assert.match(await validationError([{ ...request, url: "file:///audio.wav" }]), /Invalid URL/);
  assert.match(await validationError([{ ...request, folder_id: "wrong" }]), /positive integer/);
  assert.match(await validationError([null]), /valid file name/);
});

test("playlists accept flat video IDs and process duplicate titles independently", async () => {
  const urls: string[] = [];
  mock.method(ytDlp as typeof ytDlp & { exec: (...args: unknown[]) => Promise<unknown> },
    "exec", async (url: string, flags: { output?: string }) => {
      if (!flags.output) return { stdout: JSON.stringify({
        entries: [{ url: "first", title: "Same" }, null, { id: "second", title: "Same" }],
      }) };
      urls.push(url);
      stagedDirectories.add(path.dirname(flags.output));
      await fs.writeFile(flags.output.replace("%(ext)s", "m4a"), url);
      return { stdout: JSON.stringify({ title: "Same", duration: 2 }) };
    });
  await downloadYouTubePlaylist(request, directory);
  assert.deepEqual(new Set(urls), new Set([
    "https://www.youtube.com/watch?v=first",
    "https://www.youtube.com/watch?v=second",
  ]));
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((record) => record.rel_path)).size, 2);
});
