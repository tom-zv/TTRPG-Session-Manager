import { useState, useCallback, useEffect, useRef } from 'react';
import AudioService, { AudioEventTypes } from '../AudioService.js';

export function usePlaylistModule() {
  // Playlist playback state
  const [currentPlaylistId, setCurrentPlaylistId] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playlistVolume, setPlaylistVolume] = useState<number>(AudioService['volumes']?.playlist || 1);
  const [position, setPosition] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  
  // Use ref for tracking the interval to avoid recreation on each render
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  /* Methods
  ***********/
  // Toggle playlist or playlist track; Play, Pause or Resume based on context
  const togglePlaylist = useCallback((collectionId: number, startIndex: number = 0) => {
    return AudioService.togglePlaylist(collectionId, startIndex);
  }, []);
    
  const nextTrack = useCallback(() => {
    AudioService.nextTrack();
  }, []);
  
  const previousTrack = useCallback(() => {
    AudioService.previousTrack();
  }, []);
  
  const setVolume = useCallback((volume: number) => {
    AudioService.setVolume('playlist', volume);
  }, []);
  
  const seekToPosition = useCallback((time: number) => {
    AudioService.seek(time);
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
      setDuration(AudioService.getDuration());
    };

    // Handle play state changes
    const handlePlayStateChange = (playing: boolean) => {
      setIsPlaying(playing);
    };

    // Subscribe to events
    AudioService.on(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
    AudioService.on(AudioEventTypes.PLAYLIST_CHANGE, handlePlaylistChange);
    AudioService.on(AudioEventTypes.PLAYLIST_TRACK_CHANGE, handleTrackChange);
    AudioService.on(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChange);

    // Initial sync with AudioService
    setCurrentPlaylistId(AudioService.getCurrentPlaylistId());
    setCurrentIndex(AudioService.getCurrentTrackIndex());
    setPlaylistVolume(AudioService['volumes']?.playlist || 1);
    setIsPlaying(AudioService.isPlaylistPlaying());
    setPosition(AudioService.getCurrentPlaylistPosition());

    // Set up position update interval only if currently playing
    const setupPositionInterval = () => {
      // Clear any existing interval first
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
      }
      
      // Only create interval if we're playing
      if (AudioService.isPlaylistPlaying()) {
        positionIntervalRef.current = setInterval(() => {
          setPosition(AudioService.getCurrentPlaylistPosition());
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
    
    AudioService.on(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChangeForInterval);
    
    // Cleanup event listeners and interval on unmount
    return () => {
      AudioService.off(AudioEventTypes.VOLUME_CHANGE, handleVolumeChange);
      AudioService.off(AudioEventTypes.PLAYLIST_CHANGE, handlePlaylistChange);
      AudioService.off(AudioEventTypes.PLAYLIST_TRACK_CHANGE, handleTrackChange);
      AudioService.off(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChange);
      AudioService.off(AudioEventTypes.PLAYLIST_STATE_CHANGE, handlePlayStateChangeForInterval);
      
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