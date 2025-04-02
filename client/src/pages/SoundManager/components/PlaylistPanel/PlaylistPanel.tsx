import React, { useState, useMemo, useCallback } from "react";
import { useGetCollectionsOfType } from "../../api/collections/useCollectionQueries.js";
import { CollectionItemsDisplay } from "../CollectionItemsDisplay/CollectionItemsDisplay.js";
import { Audio } from "../AudioService/AudioContext.js";

import "./PlaylistPanel.css";

const PlaylistPanel: React.FC = React.memo(() => {

  // Get audio context functionality
  const { toggleAudioItem, isAudioItemPlaying, playlist: { togglePlaylist, currentIndex }} = Audio.useAudio();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);

  const { data: playlistCollection } = useGetCollectionsOfType("playlist");
  const playlists = playlistCollection?.items || [];

  // Memoize the selected playlist to prevent unnecessary lookups
  const selectedPlaylist = useMemo(() => 
    playlists?.find((playlist) => playlist.id === selectedPlaylistId),
    [playlists, selectedPlaylistId]
  );

  // Function to handle going back to all playlists
  const handleBackClick = useCallback(() => {
    setSelectedPlaylistId(null);
  }, []);
  
  // Handle playlist selection
  const handlePlaylistSelect = useCallback((itemId: number) => {
    setSelectedPlaylistId(itemId);
  }, []);
  
  // Handle play/pause toggle
  const handleTogglePlay = useCallback(() => {
    if (selectedPlaylist) {
      togglePlaylist(selectedPlaylistId!, currentIndex );
    }
  }, [selectedPlaylist, toggleAudioItem]);

  // Don't render if the ItemPanel is active

  const listViewProps = {
    collectionType: "playlist" as const,
    collectionId: -1,
    view: "list" as const,
    showToggle: false,
    showHeaders: false,
    showPlayButton: true,
    onItemClick: handlePlaylistSelect,
    isDragSource: false,
    isReorderable: false,
    isDropTarget: false,
  };
  
  const detailViewProps = {
    collectionType: "playlist" as const,
    collectionId: selectedPlaylistId!,
    view: "list" as const,
    showToggle: false,
    showHeaders: true,
    showActions: true,
    isDragSource: true,
    isReorderable: true,
    isDropTarget: true,
    acceptedDropTypes: ["file"],
  };

  return (
    <div className="playlist-panel">
      {!selectedPlaylistId ? (
        <>
          <div className="panel-header">
            <h3>Playlists</h3>
          </div>
          <CollectionItemsDisplay {...listViewProps} />
        </>
      ) : selectedPlaylist ? (
        <>
          <div className="panel-header">
            <button className="back-button" onClick={handleBackClick}>
              ←
            </button>
            <h3>{selectedPlaylist.name}</h3>
            <button
              className={`play-all-button ${isAudioItemPlaying(selectedPlaylist) ? "playing" : ""}`}
              onClick={handleTogglePlay}
              title={isAudioItemPlaying(selectedPlaylist) ? "Pause" : "Play all"}
            >
              {isAudioItemPlaying(selectedPlaylist) ? "⏸" : "▶"}
            </button>
          </div>
          <CollectionItemsDisplay {...detailViewProps} />
          
        </>
        
      ) : null}
    </div>
  );
});

export default PlaylistPanel;
