import { useState, useCallback, useEffect, useRef } from 'react';
import { PlaylistModule } from '../modules/playlistModule.js';
import { AudioEventTypes, on, off } from '../events.js';
import { getVolume } from '../volumeStore.js';

// Create a singleton instance of PlaylistModule
const playlistModule = new PlaylistModule();

export function usePlaylistModule() {
  // Playlist playback state
  const [currentPlaylistId, setCurrentPlaylistId] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playlistVolume, setPlaylistVolume] = useState<number>(getVolume('playlist'));
  const [position, setPosition] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  
  // Use ref for tracking the interval to avoid recreation on each render
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // Set up event listeners for state changes
  useEffect(() => {
    // Handle volume changes
    const handleVolumeChange = (data: {category: string, volume: number}) => {
      if (data.category === 'playlist') {
        setPlaylistVolume(data.volume);
      }
    };

    // Handle playlist changes
    const handlePlaylistChange = (data: {
      id: number;
      currentIndex: number;
    }) => {
      setCurrentPlaylistId(data.id);
      setCurrentIndex(data.currentIndex);
    };

    // Handle track changes
    const handleTrackChange = (data: {index: number}) => {
      setCurrentIndex(data.index);
      setPosition(0);
      setDuration(playlistModule.getDuration());
    };

    // Handle play state changes
    const handlePlayStateChange = (playing: boolean) => {
      setIsPlaying(playing);
    };

    // Subscribe to events using the events system
    on(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
    on(AudioEventTypes.PLAYLIST_CHANGE, handlePlaylistChange);
    on(AudioEventTypes.PLAYLIST_TRACK_CHANGE, handleTrackChange);
    on(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChange);

    // Initial sync with PlaylistModule
    setCurrentPlaylistId(playlistModule.getCurrentPlaylistId());
    setCurrentIndex(playlistModule.getCurrentTrackIndex());
    setPlaylistVolume(getVolume('playlist'));
    setIsPlaying(playlistModule.isPlaylistPlaying());
    setPosition(playlistModule.getCurrentPlaylistPosition());
    setDuration(playlistModule.getDuration());

    // Set up position update interval only if currently playing
    const setupPositionInterval = () => {
      // Clear any existing interval first
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
      }
      
      // Only create interval if we're playing
      if (playlistModule.isPlaylistPlaying()) {
        positionIntervalRef.current = setInterval(() => {
          setPosition(playlistModule.getCurrentPlaylistPosition());
        }, 1000); // Update every second 
      }
    };
    
    // Initial setup
    setupPositionInterval();
    
    // Update interval when playing state changes
    const handlePlayStateChangeForInterval = (playing: boolean) => {
      if (playing) {
        setupPositionInterval();
      } else if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
      }
    };
    
    on(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChangeForInterval);
    
    // Cleanup event listeners and interval on unmount
    return () => {
      off(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
      off(AudioEventTypes.PLAYLIST_CHANGE, handlePlaylistChange);
      off(AudioEventTypes.PLAYLIST_TRACK_CHANGE, handleTrackChange);
      off(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChange);
      off(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChangeForInterval);
      
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
        positionIntervalRef.current = null;
      }
    };
  }, []);
  
  return {
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
  };
}