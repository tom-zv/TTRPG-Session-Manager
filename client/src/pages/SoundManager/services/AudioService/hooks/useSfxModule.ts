import { useCallback, useMemo, useSyncExternalStore } from "react";
import { sfxModule } from "../modules/sfxModule.js";
import { AudioEventTypes, on, off } from "../events.js";
import { useDebounce } from "src/hooks/useDebounce.js";
import { useUpdateFileVolume } from "src/pages/SoundManager/api/collections/mutations/useCollectionItemMutations.js";
import { useUpdateMacroVolume } from "src/pages/SoundManager/api/collections/useSfxMutations.js";
import type { AudioFile, AudioMacro } from "../../../types/AudioItem.js";

type SfxSnapshot = {
  volume: number;
  playingSoundIds: number[];
  playingMacroIds: number[];
};

let cachedSfxSnapshot: SfxSnapshot | null = null;

const areNumberArraysEqual = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const getSfxSnapshot = (): SfxSnapshot => {
  const nextSnapshot: SfxSnapshot = {
    volume: sfxModule.volume,
    playingSoundIds: sfxModule.playingSoundIds,
    playingMacroIds: sfxModule.playingMacroIds,
  };

  if (
    cachedSfxSnapshot &&
    cachedSfxSnapshot.volume === nextSnapshot.volume &&
    areNumberArraysEqual(
      cachedSfxSnapshot.playingSoundIds,
      nextSnapshot.playingSoundIds
    ) &&
    areNumberArraysEqual(
      cachedSfxSnapshot.playingMacroIds,
      nextSnapshot.playingMacroIds
    )
  ) {
    return cachedSfxSnapshot;
  }

  cachedSfxSnapshot = nextSnapshot;
  return nextSnapshot;
};

const subscribeToSfxSnapshot = (onStoreChange: () => void) => {
  on(AudioEventTypes.VOLUME_CHANGE, onStoreChange);
  on(AudioEventTypes.SFX_FILE_CHANGE, onStoreChange);
  on(AudioEventTypes.SFX_MACRO_CHANGE, onStoreChange);

  return () => {
    off(AudioEventTypes.VOLUME_CHANGE, onStoreChange);
    off(AudioEventTypes.SFX_FILE_CHANGE, onStoreChange);
    off(AudioEventTypes.SFX_MACRO_CHANGE, onStoreChange);
  };
};

export function useSfxModule() {
  const {
    volume: masterVolume,
    playingSoundIds,
    playingMacroIds,
  } = useSyncExternalStore(
    subscribeToSfxSnapshot,
    getSfxSnapshot,
    getSfxSnapshot
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

  return useMemo(
    () => ({
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
      getFilePosition,
    }),
    [
      masterVolume,
      playingSoundIds,
      playingMacroIds,
      toggleFile,
      toggleMacro,
      setMasterVolume,
      setSoundVolume,
      setMacroVolume,
      getFilePosition,
    ]
  );
}
