import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { PlaylistModule } from '../modules/playlistModule.js';
import { AudioEventTypes, on, off } from '../events.js';
import { getVolume } from '../volumeStore.js';

// Create a singleton instance of PlaylistModule
const playlistModule = new PlaylistModule();

type PlaylistSnapshot = {
  currentPlaylistId: number | null;
  currentIndex: number;
  isPlaying: boolean;
  playlistVolume: number;
  duration: number;
};

let cachedPlaylistSnapshot: PlaylistSnapshot | null = null;

const getPlaylistSnapshot = (): PlaylistSnapshot => {
  const nextSnapshot: PlaylistSnapshot = {
    currentPlaylistId: playlistModule.getCurrentPlaylistId(),
    currentIndex: playlistModule.getCurrentTrackIndex(),
    isPlaying: playlistModule.isPlaylistPlaying(),
    playlistVolume: getVolume('playlist'),
    duration: playlistModule.getDuration(),
  };

  if (
    cachedPlaylistSnapshot &&
    cachedPlaylistSnapshot.currentPlaylistId === nextSnapshot.currentPlaylistId &&
    cachedPlaylistSnapshot.currentIndex === nextSnapshot.currentIndex &&
    cachedPlaylistSnapshot.isPlaying === nextSnapshot.isPlaying &&
    cachedPlaylistSnapshot.playlistVolume === nextSnapshot.playlistVolume &&
    cachedPlaylistSnapshot.duration === nextSnapshot.duration
  ) {
    return cachedPlaylistSnapshot;
  }

  cachedPlaylistSnapshot = nextSnapshot;
  return nextSnapshot;
};

const subscribeToPlaylistSnapshot = (onStoreChange: () => void) => {
  on(AudioEventTypes.VOLUME_CHANGE, onStoreChange);
  on(AudioEventTypes.PLAYLIST_CHANGE, onStoreChange);
  on(AudioEventTypes.PLAYLIST_TRACK_CHANGE, onStoreChange);
  on(AudioEventTypes.PLAYLIST_STATE_CHANGE, onStoreChange);

  return () => {
    off(AudioEventTypes.VOLUME_CHANGE, onStoreChange);
    off(AudioEventTypes.PLAYLIST_CHANGE, onStoreChange);
    off(AudioEventTypes.PLAYLIST_TRACK_CHANGE, onStoreChange);
    off(AudioEventTypes.PLAYLIST_STATE_CHANGE, onStoreChange);
  };
};

export function usePlaylistModule() {
  const {
    currentPlaylistId,
    currentIndex,
    isPlaying,
    playlistVolume,
    duration,
  } = useSyncExternalStore(
    subscribeToPlaylistSnapshot,
    getPlaylistSnapshot,
    getPlaylistSnapshot
  );
  const [position, setPosition] = useState<number>(() =>
    playlistModule.getCurrentPlaylistPosition()
  );
  
  /* Methods
  ***********/
  // Toggle playlist or playlist track; Play, Pause or Resume based on context
  const togglePlaylist = useCallback((collectionId: number, startIndex: number = 0) => {
    return playlistModule.togglePlaylist(collectionId, startIndex);
  }, []);
    
  const nextTrack = useCallback(() => {
    playlistModule.nextTrack();
  }, []);
  
  const previousTrack = useCallback(() => {
    playlistModule.previousTrack();
  }, []);
  
  const setVolume = useCallback((volume: number) => {
    playlistModule.updateVolume(volume);
  }, []);
  
  const seekToPosition = useCallback((time: number) => {
    playlistModule.seek(time);
    setPosition(time); // Optimistic UI update
  }, []);

  // Keep time position in sync with playback events and while actively playing.
  useEffect(() => {
    const syncPosition = () => {
      setPosition(playlistModule.getCurrentPlaylistPosition());
    };

    on(AudioEventTypes.PLAYLIST_TRACK_CHANGE, syncPosition);
    on(AudioEventTypes.PLAYLIST_STATE_CHANGE, syncPosition);

    return () => {
      off(AudioEventTypes.PLAYLIST_TRACK_CHANGE, syncPosition);
      off(AudioEventTypes.PLAYLIST_STATE_CHANGE, syncPosition);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return undefined;

    const intervalId = window.setInterval(() => {
      setPosition(playlistModule.getCurrentPlaylistPosition());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isPlaying]);
  
  return useMemo(
    () => ({
      // playlist id and state
      currentPlaylistId,
      currentIndex,
      isPlaying,
      playlistVolume,
      position,
      duration,
      // Methods
      togglePlaylist,
      nextTrack,
      previousTrack,
      setVolume,
      seekToPosition,
    }),
    [
      currentPlaylistId,
      currentIndex,
      isPlaying,
      playlistVolume,
      position,
      duration,
      togglePlaylist,
      nextTrack,
      previousTrack,
      setVolume,
      seekToPosition,
    ]
  );
}
