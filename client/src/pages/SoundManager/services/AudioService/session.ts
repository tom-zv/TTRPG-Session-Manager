import type { QueryClient } from "@tanstack/react-query";
import { collectionKeys } from "../../api/collections/useCollectionQueries.js";
import { downloadEventBus } from "src/services/EventBus/DownloadEventBus.js";
import { ambienceModule } from "./hooks/useAmbienceModule.js";
import { playlistModule } from "./hooks/usePlaylistModule.js";
import { sfxModule } from "./modules/sfxModule.js";

/** Release playback, subscriptions and cached collections when the GM leaves the workspace. */
export function endGmAudioSession(queryClient: QueryClient): void {
  playlistModule.reset();
  ambienceModule.reset();
  sfxModule.reset();
  downloadEventBus.stop();
  void queryClient.cancelQueries({ queryKey: collectionKeys.all });
  queryClient.removeQueries({ queryKey: collectionKeys.all });
}
