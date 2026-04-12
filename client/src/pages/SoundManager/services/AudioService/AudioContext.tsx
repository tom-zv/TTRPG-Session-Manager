import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePlaylistModule } from "./hooks/usePlaylistModule.js";
import { useAmbienceModule } from "./hooks/useAmbienceModule.js";
import { useSfxModule } from "./hooks/useSfxModule.js";
import { initQueryClient } from "./queryClient.js";
import {
  AudioCollection,
  AudioItem,
  isAudioFile,
  isAudioMacro,
  isAudioCollection,
} from "../../types/AudioItem.js";

export type AudioItemPlayState = "unsupported" | "off" | "active" | "playing";

interface AudioItemControlsContextType {
  toggleAudioItem: (
    item: AudioItem,
    parentCollection?: AudioCollection
  ) => Promise<boolean>;
  updateAudioItemVolume: (
    item: AudioItem,
    volume: number,
    parentCollection?: AudioCollection
  ) => void;
}

interface AudioItemStateContextType {
  getAudioItemPlayState: (
    item: AudioItem,
    parentCollection?: AudioCollection
  ) => AudioItemPlayState;
  isCurrentPlaylistTrack: (
    item: AudioItem,
    parentCollection: AudioCollection
  ) => boolean;
}

type PlaylistAudioContextType = ReturnType<typeof usePlaylistModule>;
type AmbienceAudioContextType = ReturnType<typeof useAmbienceModule>;
type SfxAudioContextType = ReturnType<typeof useSfxModule>;

const AudioItemControlsContext = createContext<
  AudioItemControlsContextType | undefined
>(undefined);
const AudioItemStateContext = createContext<
  AudioItemStateContextType | undefined
>(undefined);
const PlaylistAudioContext = createContext<
  PlaylistAudioContextType | undefined
>(undefined);
const AmbienceAudioContext = createContext<
  AmbienceAudioContextType | undefined
>(undefined);
const SfxAudioContext = createContext<SfxAudioContextType | undefined>(
  undefined
);

function useRequiredAudioContext<T>(
  context: React.Context<T | undefined>,
  hookName: string
) {
  const value = useContext(context);
  if (value === undefined) {
    throw new Error(`${hookName} must be used within an AudioProvider`);
  }
  return value;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const playlist = usePlaylistModule();
  const ambience = useAmbienceModule();
  const sfx = useSfxModule();

  const queryClient = useQueryClient();

  useEffect(() => {
    initQueryClient(queryClient);
  }, [queryClient]);

  const {
    currentPlaylistId,
    currentIndex,
    isPlaying: isPlaylistPlaying,
    togglePlaylist,
    setVolume: setPlaylistVolume,
  } = playlist;
  const {
    playingCollectionId,
    playingFileIds,
    toggleCollection,
    toggleFileActivation,
    setFileVolume,
    setMasterVolume,
  } = ambience;
  const {
    playingSoundIds,
    playingMacroIds,
    toggleFile,
    toggleMacro,
    setVolume: setSfxVolume,
    setSoundVolume,
    setMacroVolume,
  } = sfx;

  const toggleAudioItem = useCallback(
    async (
      item: AudioItem,
      parentCollection?: AudioCollection
    ): Promise<boolean> => {
      if (isAudioMacro(item)) {
        return toggleMacro(item);
      }

      if (isAudioCollection(item)) {
        switch (item.audioType) {
          case "playlist":
            return togglePlaylist(item.id, 0);
          case "ambience":
            return toggleCollection(item);
          case "sfx":
            return false;
        }
      }

      if (isAudioFile(item)) {
        if (!parentCollection) {
          return toggleFile(item);
        }

        switch (parentCollection.audioType) {
          case "playlist":
            return togglePlaylist(parentCollection.id, item.position);
          case "ambience":
            return toggleFileActivation(parentCollection, item);
          case "sfx":
            return toggleFile(item);
        }
      }

      console.warn("Invalid audio item type:", item);
      return false;
    },
    [
      toggleMacro,
      togglePlaylist,
      toggleCollection,
      toggleFile,
      toggleFileActivation,
    ]
  );

  const getAudioItemPlayState = useCallback(
    (item: AudioItem, parentCollection?: AudioCollection): AudioItemPlayState => {
      if (isAudioCollection(item)) {
        if (isAudioMacro(item)) {
          return playingMacroIds.some((macro) => macro === item.id)
            ? "playing"
            : "off";
        }

        switch (item.audioType) {
          case "playlist":
            return currentPlaylistId === item.id && isPlaylistPlaying
              ? "playing"
              : "off";
          case "ambience": {
            const isCollectionRunning = playingCollectionId === item.id;
            if (!isCollectionRunning) {
              return "off";
            }
            return playingFileIds.length > 0 ? "playing" : "active";
          }
          case "sfx":
            return "unsupported";
        }
      }

      if (isAudioFile(item)) {
        if (parentCollection) {
          switch (parentCollection.audioType) {
            case "playlist":
              return currentPlaylistId === parentCollection.id &&
                isPlaylistPlaying &&
                currentIndex === item.position
                ? "playing"
                : "off";
            case "ambience": {
              const isFilePlaying = playingFileIds.includes(item.id);
              if (isFilePlaying) {
                return "playing";
              }
              if (item.active) {
                return "active";
              }
              return "off";
            }
            case "sfx":
              return playingSoundIds.some((sound) => sound === item.id)
                ? "playing"
                : "off";
          }
        }

        return playingSoundIds.some((sound) => sound === item.id)
          ? "playing"
          : "off";
      }

      return "off";
    },
    [
      currentPlaylistId,
      isPlaylistPlaying,
      currentIndex,
      playingCollectionId,
      playingFileIds,
      playingSoundIds,
      playingMacroIds,
    ]
  );

  const isCurrentPlaylistTrack = useCallback(
    (item: AudioItem, parentCollection: AudioCollection): boolean => {
      return (
        isAudioFile(item) &&
        parentCollection.audioType === "playlist" &&
        currentPlaylistId === parentCollection.id &&
        currentIndex === item.position
      );
    },
    [currentPlaylistId, currentIndex]
  );

  const updateAudioItemVolume = useCallback(
    (item: AudioItem, volume: number, parentCollection?: AudioCollection) => {
      if (isAudioMacro(item)) {
        setMacroVolume(item.id, volume);
        return;
      }

      if (isAudioCollection(item)) {
        switch (item.audioType) {
          case "macro":
            break;
          case "playlist":
            if (item.id === currentPlaylistId) {
              setPlaylistVolume(volume);
            }
            break;
          case "ambience":
            if (item.id === playingCollectionId) {
              setMasterVolume(volume);
            }
            break;
          case "sfx":
            setSfxVolume(volume);
            break;
        }
      } else if (isAudioFile(item)) {
        if (!parentCollection) {
          return;
        }
        switch (parentCollection.audioType) {
          case "playlist":
            if (parentCollection.id === currentPlaylistId) {
              setPlaylistVolume(volume);
            }
            break;
          case "ambience":
            setFileVolume(parentCollection.id, item.id, volume);
            break;
          case "sfx":
            setSoundVolume(parentCollection.id, item.id, volume);
            break;
        }
      }
    },
    [
      currentPlaylistId,
      playingCollectionId,
      setFileVolume,
      setMacroVolume,
      setMasterVolume,
      setPlaylistVolume,
      setSfxVolume,
      setSoundVolume,
    ]
  );

  const audioItemControlsValue: AudioItemControlsContextType = useMemo(
    () => ({
      toggleAudioItem,
      updateAudioItemVolume,
    }),
    [toggleAudioItem, updateAudioItemVolume]
  );

  const audioItemStateValue: AudioItemStateContextType = useMemo(
    () => ({
      getAudioItemPlayState,
      isCurrentPlaylistTrack,
    }),
    [getAudioItemPlayState, isCurrentPlaylistTrack]
  );

  return (
    <PlaylistAudioContext.Provider value={playlist}>
      <AmbienceAudioContext.Provider value={ambience}>
        <SfxAudioContext.Provider value={sfx}>
          <AudioItemControlsContext.Provider value={audioItemControlsValue}>
            <AudioItemStateContext.Provider value={audioItemStateValue}>
              {children}
            </AudioItemStateContext.Provider>
          </AudioItemControlsContext.Provider>
        </SfxAudioContext.Provider>
      </AmbienceAudioContext.Provider>
    </PlaylistAudioContext.Provider>
  );
}

export function useAudioItemControls() {
  return useRequiredAudioContext(
    AudioItemControlsContext,
    "useAudioItemControls"
  );
}

export function useAudioItemState() {
  return useRequiredAudioContext(AudioItemStateContext, "useAudioItemState");
}

export function usePlaylistAudio() {
  return useRequiredAudioContext(PlaylistAudioContext, "usePlaylistAudio");
}

export function useAmbienceAudio() {
  return useRequiredAudioContext(AmbienceAudioContext, "useAmbienceAudio");
}

export function useSfxAudio() {
  return useRequiredAudioContext(SfxAudioContext, "useSfxAudio");
}

export const Audio = {
  usePlaylist: usePlaylistAudio,
  useAmbience: useAmbienceAudio,
  useSfx: useSfxAudio,
  useAudioItemControls,
  useAudioItemState,
};
