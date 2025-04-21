import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import AudioService from "./AudioService.js";
import { usePlaylistModule } from "./modules/usePlaylistModule.js";
import { useAmbienceModule } from "./modules/useAmbienceModule.js";
import { useSfxModule } from "./modules/useSfxModule.js";
import {
  AudioCollection,
  AudioFile,
  AudioMacro,
  AudioItem,
  isAudioFile,
  isAudioMacro,
  isAudioCollection,
  isPlaylistCollection,
  isAmbienceCollection,
  isSfxCollection,
} from "../../types/AudioItem.js";

// Define the context shape
interface AudioContextType {
  // Universal audio control
  toggleAudioItem: (
    item: AudioItem,
    parentCollection?: AudioCollection
  ) => boolean;
  // Item status checks
  isAudioItemPlaying: (
    item: AudioItem,
    parentCollection?: AudioCollection
  ) => boolean;
  updateAudioItemVolume: (
    item: AudioItem,
    volume: number,
    parentCollection?: AudioCollection
  ) => void;

  // Playlist functionality
  playlist: {
    currentPlaylistId: number | null;
    currentIndex: number;
    isPlaying: boolean;
    playlistVolume: number;
    position: number;
    duration: number;
    togglePlaylist: (id: number, startIndex?: number) => boolean;
    nextTrack: () => void;
    previousTrack: () => void;
    setVolume: (volume: number) => void;
    seekToPosition: (time: number) => void;
  };

  // Ambience functionality
  ambience: {
    playingCollectionId: number | undefined;
    volume: number;
    toggleCollection: (collection: AudioCollection) => boolean;
    toggleFileActivation: (
      collection: AudioCollection,
      file: AudioFile
    ) => boolean;
    setFileVolume: (
      collectionId: number,
      fileId: number,
      volume: number
    ) => void;
    setMasterVolume: (volume: number) => void;
  };

  // SFX functionality
  sfx: {
    volume: number;
    playingSoundIds: number[];
    playingMacroIds: number[];
    toggleFile: (sound: AudioFile) => void;
    toggleMacro: (macro: AudioMacro) => void;
    setVolume: (volume: number) => void;
    setSoundVolume: (
      parentCollectionId: number,
      id: number,
      volume: number
    ) => void;
    setMacroVolume: (id: number, volume: number) => void;
  };
}

// Create the context
const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  // Initialize the audio modules
  const playlist = usePlaylistModule();
  const ambience = useAmbienceModule();
  const sfx = useSfxModule();

  const queryClient = useQueryClient();

  useEffect(() => {
    AudioService.setQueryClient(queryClient);
  }, [queryClient]);

  // Universal toggle function that works with any audio item type
  const toggleAudioItem = useCallback(
    (item: AudioItem, parentCollection?: AudioCollection): boolean => { 
      if (isAudioCollection(item)) {
        if (isAudioMacro(item)) {
          return sfx.toggleMacro(item);
        } else if (isPlaylistCollection(item)) {
          return playlist.togglePlaylist(item.id, 0);
        } else if (isAmbienceCollection(item)) {
          return ambience.toggleCollection(item);
        } else if (isSfxCollection(item)) {
          return false; // SFX collections are not directly toggled
        }
      }
      
      // For audio files, determine the type and use the appropriate toggle
      if (isAudioFile(item)) {
        if (parentCollection) {
          switch (parentCollection.type) {
            case "playlist":
              return playlist.togglePlaylist(
                parentCollection.id,
                item.position
              );
            case "ambience":
              return ambience.toggleFileActivation(parentCollection, item);
            case "sfx":
              return sfx.toggleFile(item);
          }
        } else {
          // Play file with no collection context, for SFX files and files played outside of collections
          return sfx.toggleFile(item);
        }
         
      }
      console.warn("Invalid audio item type:", item);
      return false;
    },
    [playlist, ambience, sfx]
  );

  // Check if an audio item is currently playing
  const isAudioItemPlaying = useCallback(
    (item: AudioItem, parentCollection?: AudioCollection): boolean => {
      // For collections
      if (isAudioCollection(item)) {
        if (isAudioMacro(item)) {
          return sfx.playingMacroIds.some(macro => macro === item.id);
        } else
        if (isPlaylistCollection(item)) {
          return playlist.currentPlaylistId === item.id && playlist.isPlaying;
        } else if (isAmbienceCollection(item)) {
          // Check if this specific ambience collection is the one currently playing
          return ambience.playingCollectionId === (item as AudioCollection).id
        } else if (isSfxCollection(item)) {
          return false; // SFX collections themselves don't "play"
        }
      }

      // For audio files
      if (isAudioFile(item)) {
        if (parentCollection) {
          switch (parentCollection.type) {
            case "playlist":
              // Check if it's the current track in the playing playlist
              return (
                playlist.currentPlaylistId === parentCollection.id &&
                playlist.isPlaying &&
                playlist.currentIndex === item.position
              );
            case "ambience":
              // An ambience file is "playing" if its parent collection is playing AND the file itself is active
              return (
                ambience.playingCollectionId === parentCollection.id &&
                ambience.playingFileIds.includes(item.id)
              );
            case "sfx":
              // Check if the file is individually active in the SFX module
              return sfx.playingSoundIds.some(sound => sound === item.id);
          }
        } else {
          // File without a parent collection context is treated as an SFX
           return sfx.playingSoundIds.some(sound => sound === item.id);
        }
      }

      // For macros
      if (isAudioMacro(item)) {
        // Check if the macro is active in the SFX module
        return sfx.playingMacroIds.some(macro => macro === (item as AudioMacro).id);
      }

      return false; // Default case
    },
    // Ensure all relevant state pieces are dependencies
    [
      playlist.currentPlaylistId,
      playlist.isPlaying,
      playlist.currentIndex,
      ambience.playingCollectionId,
      ambience.playingFileIds,
      sfx.playingSoundIds,
      sfx.playingMacroIds,
    ]
  );

  const updateAudioItemVolume = useCallback(
    (item: AudioItem, volume: number, parentCollection?: AudioCollection) => {
      if (isAudioCollection(item)) {
        switch (item.type) {
          case "macro":
            sfx.setMacroVolume(item.id, volume);
            break;
          case "playlist":
            if (item.id === playlist.currentPlaylistId) {
              playlist.setVolume(volume);
            }
            break;
          case "ambience":
            if (item.id === ambience.playingCollectionId) {
              ambience.setMasterVolume(volume);
            }
            break;
          case "sfx":
            sfx.setVolume(volume);
            break;
        }
      } else if (isAudioFile(item)) {
        if (!parentCollection) {
          return;
        }
        switch (parentCollection.type) {
          case "playlist":
            if (parentCollection.id === playlist.currentPlaylistId) {
              playlist.setVolume(volume);
            }
            break;
          case "ambience":
              ambience.setFileVolume(parentCollection.id, item.id, volume);
            break;
          case "sfx":
            sfx.setSoundVolume(parentCollection.id, item.id, volume);
            break;
        }
      }
    },
    [playlist, ambience, sfx]
  );

  // Combine all modules into a single context value
  const audioContextValue: AudioContextType = {
    toggleAudioItem,
    isAudioItemPlaying,
    updateAudioItemVolume,
    playlist,
    ambience,
    sfx,
  };

  return (
    <AudioContext.Provider value={audioContextValue}>
      {children}
    </AudioContext.Provider>
  );
}

// Custom hook for using the audio context
export function useAudio() {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
}

// Export a named object for easy import of individual modules
export const Audio = {
  usePlaylist: () => useAudio().playlist,
  useAmbience: () => useAudio().ambience,
  useSfx: () => useAudio().sfx,
  useAudio,
};

export default AudioContext;
