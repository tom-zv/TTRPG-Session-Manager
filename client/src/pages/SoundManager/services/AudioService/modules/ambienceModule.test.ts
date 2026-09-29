import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { collectionKeys } from "../../../api/collections/useCollectionQueries.js";
import { FakeHowl, resetFakeHowls } from "src/test/fakes/howler.js";
import type { AudioCollection, AudioFile } from "../../../types/AudioItem.js";
import { initQueryClient } from "../queryClient.js";
import { resolveAudioSource } from "../utils/pathResolvers.js";
import { AmbienceModule } from "./ambienceModule.js";

vi.mock("howler", async () => (await import("src/test/fakes/howler.js")).howlerModule);
vi.mock("../utils/pathResolvers.js", () => ({ resolveAudioSource: vi.fn() }));

const activeFile = (id: number): AudioFile => ({
  id,
  name: `ambience-${id}`,
  type: "file",
  audioType: "ambience",
  duration: 1,
  path: `audio/ambience/ambience-${id}.mp3`,
  active: true,
});

describe("AmbienceModule", () => {
  beforeEach(() => {
    resetFakeHowls();
    vi.mocked(resolveAudioSource).mockReset();
  });

  test.each(["reset", "stopAmbienceCollection"] as const)("%s cancels a pending sound and the rest of its collection", async stop => {
    const queryClient = new QueryClient();
    initQueryClient(queryClient);
    const files = [activeFile(1), activeFile(2)];
    const collection: AudioCollection = {
      id: 7,
      name: "Night camp",
      type: "collection",
      audioType: "ambience",
      items: files,
    };
    queryClient.setQueryData(collectionKeys.collection("ambience", collection.id), collection);

    let resolveFirst!: (source: string) => void;
    const firstSource = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(resolveAudioSource).mockImplementation((file) =>
      file.path === files[0].path
        ? firstSource
        : Promise.resolve("/audio/ambience/ambience-2.mp3"),
    );

    const module = new AmbienceModule();
    const playing = module.playAmbienceCollection(collection.id);
    await vi.waitFor(() => expect(resolveAudioSource).toHaveBeenCalledTimes(1));

    module[stop]();
    resolveFirst("/audio/ambience/ambience-1.mp3");
    await playing;

    expect(resolveAudioSource).toHaveBeenCalledTimes(1);
    expect(FakeHowl.instances).toEqual([]);
    expect(module.currentCollectionId).toBeUndefined();
    expect(module.playingFileIds).toEqual([]);
  });

  test("logout stops ambience that is already fading out", async () => {
    const queryClient = new QueryClient();
    initQueryClient(queryClient);
    const collection: AudioCollection = { id: 8, name: "Camp", type: "collection", audioType: "ambience", items: [activeFile(1)] };
    queryClient.setQueryData(collectionKeys.collection("ambience", collection.id), collection);
    vi.mocked(resolveAudioSource).mockResolvedValue("/audio/ambience/camp.mp3");
    const module = new AmbienceModule();
    await module.playAmbienceCollection(collection.id);
    const [sound] = FakeHowl.instances;
    module.stopAmbienceCollection();
    expect(sound.playing()).toBe(true);
    module.reset();
    expect(sound.playing()).toBe(false);
    expect(sound.state()).toBe("unloaded");
  });
});
