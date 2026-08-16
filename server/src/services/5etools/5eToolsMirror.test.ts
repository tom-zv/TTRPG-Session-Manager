import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FiveEToolsMirror } from "./5eToolsMirror.js";

const SHA = "c286d15651c5b79004496132c22164f59728480d";
const NEXT_SHA = "0123456789abcdef0123456789abcdef01234567";

describe("5etools mirror", () => {
  let cacheDir: string;
  let requests: string[];
  let commit: string;
  let fail: string | undefined;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), "5etools-mirror-"));
    requests = [];
    commit = SHA;
    fail = undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      if (url.includes("api.github.com")) return new Response(commit);
      if (fail && url.endsWith(fail)) return new Response("<html>rate limited</html>", { status: 404 });
      const sha = url.split("/")[5];
      return new Response(JSON.stringify({ file: url.split("/data/")[1], sha }));
    }));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(cacheDir, { recursive: true, force: true });
  });

  test("a branch resolves to one commit, files come from that commit and a repeat read uses the cache", async () => {
    const mirror = await FiveEToolsMirror.open({ cacheDir });
    expect(mirror.revision).toBe(SHA);

    expect(await mirror.readAll(["bestiary/index.json", "items.json"])).toEqual([
      { file: "bestiary/index.json", sha: SHA },
      { file: "items.json", sha: SHA },
    ]);
    expect(await readFile(path.join(cacheDir, SHA, "data", "items.json"), "utf8")).toContain(SHA);

    requests = [];
    const again = await FiveEToolsMirror.open({ cacheDir, ref: SHA });
    expect(await again.readJson("items.json")).toEqual({ file: "items.json", sha: SHA });
    expect(requests).toEqual([]);
  });

  test("offline reuses the commit the branch last resolved to and fetches nothing", async () => {
    await (await FiveEToolsMirror.open({ cacheDir })).readJson("items.json");
    commit = NEXT_SHA; // upstream moved on

    requests = [];
    const offline = await FiveEToolsMirror.open({ cacheDir, offline: true });
    expect(offline.revision).toBe(SHA);
    expect(await offline.readJson("items.json")).toEqual({ file: "items.json", sha: SHA });
    await expect(offline.readJson("spells/index.json")).rejects.toThrow("offline");
    expect(requests).toEqual([]);
  });

  test("a failed download is not cached, and reads outside the data folder are refused", async () => {
    const mirror = await FiveEToolsMirror.open({ cacheDir });
    fail = "items.json";
    await expect(mirror.readJson("items.json")).rejects.toThrow("HTTP 404");
    fail = undefined;
    expect(await mirror.readJson("items.json")).toEqual({ file: "items.json", sha: SHA });

    await expect(mirror.readJson("../../refs/main")).rejects.toThrow("outside the data folder");
  });
});
