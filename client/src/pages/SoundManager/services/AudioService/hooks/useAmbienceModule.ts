import { useCallback, useMemo, useSyncExternalStore } from "react";
import { AudioEventTypes, on, off } from "../events.js";
import { AmbienceModule } from "../modules/ambienceModule.js";
import { getVolume } from "../volumeStore.js";
import type { AudioCollection, AudioFile } from "../../../types/AudioItem.js";
import {
  useActivateAmbienceFile,
  useDeactivateAmbienceFile,
} from "../../../api/collections/mutations/useAmbienceMutations.js";
import { useUpdateFileVolume } from "src/pages/SoundManager/api/collections/mutations/useCollectionItemMutations.js";
import { useDebounce } from "src/hooks/useDebounce.js";

const ambienceModule = new AmbienceModule();

type AmbienceSnapshot = {
  playingCollectionId: number | undefined;
  playingFileIds: number[];
  volume: number;
};

let cachedAmbienceSnapshot: AmbienceSnapshot | null = null;

const areNumberArraysEqual = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const getAmbienceSnapshot = (): AmbienceSnapshot => {
  const nextSnapshot: AmbienceSnapshot = {
    playingCollectionId: ambienceModule.currentCollectionId,
    playingFileIds: ambienceModule.playingFileIds,
    volume: getVolume("ambience"),
  };

  if (
    cachedAmbienceSnapshot &&
    cachedAmbienceSnapshot.playingCollectionId === nextSnapshot.playingCollectionId &&
    cachedAmbienceSnapshot.volume === nextSnapshot.volume &&
    areNumberArraysEqual(
      cachedAmbienceSnapshot.playingFileIds,
      nextSnapshot.playingFileIds
    )
  ) {
    return cachedAmbienceSnapshot;
  }

  cachedAmbienceSnapshot = nextSnapshot;
  return nextSnapshot;
};

const subscribeToAmbienceSnapshot = (onStoreChange: () => void) => {
  on(AudioEventTypes.VOLUME_CHANGE, onStoreChange);
  on(AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, onStoreChange);
  on(AudioEventTypes.AMBIENCE_FILE_CHANGE, onStoreChange);

  return () => {
    off(AudioEventTypes.VOLUME_CHANGE, onStoreChange);
    off(AudioEventTypes.AMBIENCE_COLLECTION_CHANGE, onStoreChange);
    off(AudioEventTypes.AMBIENCE_FILE_CHANGE, onStoreChange);
  };
};

export function useAmbienceModule() {
  const { playingCollectionId, playingFileIds, volume } = useSyncExternalStore(
    subscribeToAmbienceSnapshot,
    getAmbienceSnapshot,
    getAmbienceSnapshot
  );

  // Get mutation functions
  const activateMutation = useActivateAmbienceFile();
  const deactivateMutation = useDeactivateAmbienceFile();
  const updateVolumeMutation = useUpdateFileVolume("ambience");

  // Debounce volume updates to avoid excessive API calls
  const debouncedUpdateVolume = useDebounce(
    (collectionId: number, fileId: number, volume: number) => {
      updateVolumeMutation.mutate({ collectionId, fileId, volume });
    },
    800
  );

  // Toggle collection activation (play/stop)
  const toggleCollection = useCallback((collection: AudioCollection) => {
    const isPlaying = ambienceModule.toggleCollection(collection.id);
    return isPlaying;
  }, []);

  // Toggle file activation (mark as active/inactive)
  const toggleFileActivation = useCallback(
    (collection: AudioCollection, file: AudioFile) => {
      if (!file.active) {
        
        ambienceModule.activateAmbienceFile(collection.id, file);
        
        activateMutation.mutate({
          collectionId: collection.id,
          fileId: file.id,
        });
      } else {
        ambienceModule.deactivateAmbienceFile(collection.id, file.id);

        deactivateMutation.mutate({
          collectionId: collection.id,
          fileId: file.id,
        });
      }
      return !file.active; // Return the intended state
    },
    [activateMutation, deactivateMutation]
  );

  // Set volume for a specific sound
  const setFileVolume = useCallback(
    (collectionId: number, fileId: number, volume: number) => {
      ambienceModule.setFileVolume(fileId, volume);
      debouncedUpdateVolume(collectionId, fileId, volume);
    },
    [debouncedUpdateVolume]
  );

  // Set master volume for all ambience
  const setMasterVolume = useCallback((volume: number) => {
    ambienceModule.setMasterVolume(volume);
  }, []);

  return useMemo(
    () => ({
      // State
      playingCollectionId,
      playingFileIds,
      volume,
      // Methods
      toggleCollection,
      toggleFileActivation,
      setFileVolume,
      setMasterVolume,
    }),
    [
      playingCollectionId,
      playingFileIds,
      volume,
      toggleCollection,
      toggleFileActivation,
      setFileVolume,
      setMasterVolume,
    ]
  );
}
