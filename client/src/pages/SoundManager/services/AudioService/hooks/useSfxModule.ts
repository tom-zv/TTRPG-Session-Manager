import { useState, useCallback, useEffect } from "react";
import { sfxModule } from "../modules/sfxModule.js";
import { AudioEventTypes, on, off } from "../events.js";
import { useDebounce } from "src/hooks/useDebounce.js";
import { useUpdateFileVolume } from "src/pages/SoundManager/api/collections/mutations/useCollectionItemMutations.js";
import { useUpdateMacroVolume } from "src/pages/SoundManager/api/collections/useSfxMutations.js";
import type { AudioFile, AudioMacro } from "../../../types/AudioItem.js";

export function useSfxModule() {
  // SFX state
  const [masterVolume, setVolume] = useState<number>(sfxModule.volume);
  const [playingSoundIds, setPlayingSoundIds] = useState<number[]>(
    sfxModule.playingSoundIds
  );
  const [playingMacroIds, setPlayingMacroIds] = useState<number[]>(
    sfxModule.playingMacroIds
  );

  const updateVolumeMutation = useUpdateFileVolume("sfx");
  const updateMacroVolumeMutation = useUpdateMacroVolume();

  // Debounce volume updates to avoid excessive API calls
  const debouncedUpdateVolume = useDebounce(
    (collectionId: number, fileId: number, volume: number) => {
      updateVolumeMutation.mutate({ collectionId, fileId, volume });
    },
    800
  );
  const debouncedUpdateMacroVolume = useDebounce(
    (macroId: number, volume: number) => {
      updateMacroVolumeMutation.mutate({ macroId, volume });
    },
    800
  );

  // SFX methods
  const toggleFile = useCallback((sound: AudioFile) => {
    return sfxModule.toggleFile(sound);
  }, []);

  const toggleMacro = useCallback((macro: AudioMacro) => {
    return sfxModule.toggleMacro(macro);
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    sfxModule.setMasterVolume(volume);
  }, []);

  const setSoundVolume = useCallback(
    (parentCollectionId: number, id: number, volume: number) => {
      sfxModule.setSfxFileVolume(id, volume);
      debouncedUpdateVolume(parentCollectionId, id, volume);
    },
    [debouncedUpdateVolume]
  );

  const setMacroVolume = useCallback(
    (id: number, volume: number) => {
      sfxModule.setMacroVolume(id, volume);
      debouncedUpdateMacroVolume(id, volume);
    },
    [debouncedUpdateMacroVolume]
  );
  
  const getFilePosition = useCallback(
    (id: number): number | null => {
      return sfxModule.getFilePosition(id);
    }, []
  );

  // Set up event listeners for state changes
  useEffect(() => {
    // Handle volume changes
    const handleVolumeChange = (data: { category: string; volume: number }) => {
      if (data.category === "sfx") {
        setVolume(data.volume);
      }
    };

    // Handle active sound changes
    const handleSfxFileChange = (fileIds: number[]) => {
      setPlayingSoundIds(fileIds);
    };

    // Handle active macro changes
    const handleSfxMacroChange = (macroIds: number[]) => {
      setPlayingMacroIds(macroIds);
    };

    // Subscribe to events
    on(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
    on(AudioEventTypes.SFX_FILE_CHANGE, handleSfxFileChange);
    on(AudioEventTypes.SFX_MACRO_CHANGE, handleSfxMacroChange);

    // Initial sync
    setVolume(sfxModule.volume);
    setPlayingSoundIds(sfxModule.playingSoundIds);
    setPlayingMacroIds(sfxModule.playingMacroIds);

    // Cleanup event listeners on unmount
    return () => {
      off(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
      off(AudioEventTypes.SFX_FILE_CHANGE, handleSfxFileChange);
      off(AudioEventTypes.SFX_MACRO_CHANGE, handleSfxMacroChange);
    };
  }, []);

  return {
    // State
    volume: masterVolume,
    playingSoundIds,
    playingMacroIds,

    // Methods
    toggleFile,
    toggleMacro,
    setVolume: setMasterVolume,
    setSoundVolume,
    setMacroVolume,
    getFilePosition
  };
}
