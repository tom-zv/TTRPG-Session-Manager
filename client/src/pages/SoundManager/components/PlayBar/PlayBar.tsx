import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Audio } from '../../services/AudioService/AudioContext.js';
import { useGetCollectionById } from '../../api/collections/useCollectionQueries.js';
import type { AudioFile } from 'src/pages/SoundManager/types/AudioItem.js'; 
import './PlayBar.css';

interface PlayBarProps {
  className?: string;
}

// Helper function for formatting time
const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return "0:00"; 
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const PlayBar: React.FC<PlayBarProps> = React.memo(({ className = '' }) => {
  const {
    playlist: {
      currentPlaylistId,
      currentIndex,
      isPlaying,
      playlistVolume,
      nextTrack,
      previousTrack,
      setVolume,
      duration,
      position,
      seekToPosition
    },
    toggleAudioItem
  } = Audio.useAudio();
  
  // Fetch the current collection data using React Query
  const { data: currentCollection } = useGetCollectionById(
    'playlist', 
    currentPlaylistId || 0
  );

  const currentTrack = useMemo<AudioFile | undefined>(() => {
    return currentCollection?.items?.[currentIndex] as AudioFile | undefined;
  }, [currentCollection, currentIndex]);

  const [displayName, setDisplayName] = useState<string>("No track selected");

  // Update display name when the track changes
  useEffect(() => {
    if (currentTrack) {
      setDisplayName(currentTrack.name);
    } else {
      setDisplayName("No track selected");
    }
  }, [currentTrack]); 

  // Memoize formatted time values to prevent recalculations
  const formattedPosition = useMemo(() => formatTime(position), [position]);
  const formattedDuration = useMemo(() => formatTime(duration), [duration]);

  // Ref for the seek bar element
  const seekBarRef = useRef<HTMLInputElement>(null);
  
  // Update progress indicator whenever position or duration changes
  useEffect(() => {
    if (seekBarRef.current && duration > 0) {
      const progressPercent = (position / duration) * 100;
      seekBarRef.current.style.setProperty('--seek-progress', `${progressPercent}%`);
    }
  }, [position, duration]);

  // Handle play/pause toggle
  const handleTogglePlay = useCallback(() => {
    if (currentTrack && currentCollection) { 
      toggleAudioItem(currentTrack, currentCollection);
    } else if (currentCollection) {
      toggleAudioItem(currentCollection);
    }
  }, [currentTrack, currentCollection, toggleAudioItem]);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  }, [setVolume]);

  // Handle seek
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    seekToPosition(parseFloat(e.target.value));
  }, [seekToPosition]);

  return (
    <div className={`play-bar ${className}`}>
      
      <div className="playbar-main-row">
        <div className="track-info">
          <span
            className="track-name"
            title={displayName}
          >
            {displayName}
          </span>
          {currentCollection && (
            <span className="collection-name" title={currentCollection.name}>
              {currentCollection.name}
            </span>
          )}
        </div>

        <div className="controls">
          <button
            className="icon-button control-button"
            onClick={previousTrack}
            disabled={!currentTrack}
            aria-label="Previous track"
          >
            ⏮
          </button>

          <button
            className="icon-button play-button"
            onClick={handleTogglePlay}
            disabled={!currentCollection}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <button
            className="icon-button control-button"
            onClick={nextTrack}
            disabled={!currentTrack}
            aria-label="Next track"
          >
            ⏭
          </button>
        </div>

        <div className="volume-control">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={playlistVolume}
            onChange={handleVolumeChange}
            className="volume-slider"
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="seek-container">
        <div className="time-display">{formattedPosition}</div>
        <input
          ref={seekBarRef}
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={position} 
          onChange={handleSeek}
          className="seek-bar"
          disabled={!currentTrack || duration <= 0} 
          aria-label="Seek"
        />
        <div className="time-display">{formattedDuration}</div> 
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.className === nextProps.className;
});

PlayBar.displayName = 'PlayBar';

export default PlayBar;