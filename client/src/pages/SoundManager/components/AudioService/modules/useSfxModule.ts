import { useState, useCallback, useEffect } from 'react';
import AudioService, { AudioEventTypes } from '../AudioService.js';
import { useDebounce } from 'src/hooks/useDebounce.js';
import { useUpdateFileVolume } from 'src/pages/SoundManager/api/collections/useFileMutations.js';
import { useUpdateMacroVolume } from 'src/pages/SoundManager/api/collections/useSfxMutations.js'; 
import type { AudioFile, AudioMacro } from '../../../types/AudioItem.js';

export function useSfxModule() {
  // SFX state
  const [masterVolume, setVolume] = useState<number>(AudioService['volumes'].sfx);
  const [playingSoundIds, setPlayingSoundIds] = useState<number[]>([]);
  const [playingMacroIds, setPlayingMacroIds] = useState<number[]>([]);
  
  const updateVolumeMutation = useUpdateFileVolume('sfx');
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
    return AudioService.toggleFile(sound);
  }, []);
  
  const toggleMacro = useCallback((macro: AudioMacro) => {
    return AudioService.toggleMacro(macro);
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    AudioService.setVolume('sfx', volume);
  }, []);
  
  const setSoundVolume = useCallback((parentCollectionId : number, id: number, volume: number) => {
    AudioService.setSfxFileVolume(id, volume);
    debouncedUpdateVolume(parentCollectionId, id, volume);
  }, []);

  const setMacroVolume = useCallback((id: number, volume: number) => {
    AudioService.setMacroVolume(id, volume);
    debouncedUpdateMacroVolume(id, volume);
  }, [updateMacroVolumeMutation]); 
  
  // Set up event listeners for state changes
  useEffect(() => {
    // Handle volume changes
    const handleVolumeChange = (category: string, volume: number) => {
      if (category === 'sfx') {
        setVolume(volume);
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
    AudioService.on(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
    AudioService.on(AudioEventTypes.SFX_FILE_CHANGE, handleSfxFileChange);
    AudioService.on(AudioEventTypes.SFX_MACRO_CHANGE, handleSfxMacroChange);

    // Initial sync
    setVolume(AudioService['volumes'].sfx);
    
    // Cleanup event listeners on unmount
    return () => {
      AudioService.off(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
      AudioService.off(AudioEventTypes.SFX_FILE_CHANGE, handleSfxFileChange);
      AudioService.off(AudioEventTypes.SFX_MACRO_CHANGE, handleSfxMacroChange);
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
  };
} 