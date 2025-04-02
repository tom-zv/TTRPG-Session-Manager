import { useState, useCallback, useEffect } from "react";
import AudioService, { AudioEventTypes } from "../AudioService.js";
import type { AudioCollection, AudioFile } from "../../../types/AudioItem.js";
import {
  useActivateAmbienceFile,
  useDeactivateAmbienceFile,
} from "../../../api/collections/useAmbienceMutations.js";
import { useUpdateFileVolume } from "../../../api/collections/useFileMutations.js";
import { useDebounce } from "src/hooks/useDebounce.js";

export function useAmbienceModule() {
  // Ambience state
  const [playingCollectionId, setPlayingCollectionId] = useState<
    number | undefined
  >(undefined);
  const [playingFileIds, setPlayingFileIds] = useState<number[]>([]);
  const [volume, setVolume] = useState<number>(
    AudioService["volumes"].ambience
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
    const isPlaying = AudioService.toggleAmbienceCollection(collection.id);
    return isPlaying;
  }, []);

  // Toggle file activation (mark as active/inactive)
  const toggleFileActivation = useCallback(
    (collection: AudioCollection, file: AudioFile) => {
      if (!file.active) {
        AudioService.activateAmbienceFile(collection.id, file.id);
        
        activateMutation.mutate({
          collectionId: collection.id,
          fileId: file.id,
        });
      } else {
        AudioService.deactivateAmbienceFile(collection.id, file.id);

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
      AudioService.setAmbienceFileVolume(fileId, volume);
      debouncedUpdateVolume(collectionId, fileId, volume);
    },
    [updateVolumeMutation]
  ); 

  // Set master volume for all ambience
  const setMasterVolume = useCallback((volume: number) => {
    AudioService.setVolume("ambience", volume);
  }, []);

  // Set up event listeners for state changes
  useEffect(() => {
    // Handle volume changes
    const handleVolumeChange = (data: { category: string; volume: number }) => {
      if (data.category === "ambience") {
        setVolume(data.volume);
      }
    };

    // Handle ambience collection changes
    const handleCollectionChange = (collectionId: number | null) => {
      setPlayingCollectionId(collectionId || undefined);
    };

    const handleFileChange = (fileIds: number[]) => {
      setPlayingFileIds(fileIds);
      console.log("Playing file IDs:", fileIds);
    }
    // Subscribe to events
    AudioService.on(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
    AudioService.on(
      AudioEventTypes.AMBIENCE_COLLECTION_CHANGE,
      handleCollectionChange
    );
    AudioService.on(
      AudioEventTypes.AMBIENCE_FILE_CHANGE,
      handleFileChange
    );

    // Initial sync
    setPlayingCollectionId(AudioService.getCurrentAmbienceCollectionId());
    setVolume(AudioService["volumes"].ambience);

    // Cleanup event listeners on unmount
    return () => {
      AudioService.off(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
      AudioService.off(
        AudioEventTypes.AMBIENCE_COLLECTION_CHANGE,
        handleCollectionChange
      );
    };
  }, []);

  return {
    // State
    playingCollectionId,
    playingFileIds,
    volume,
    // Methods
    toggleCollection,
    toggleFileActivation,
    setFileVolume,
    setMasterVolume,
  };
}
