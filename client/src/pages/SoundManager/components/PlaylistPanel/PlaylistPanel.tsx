import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useGetCollectionsOfType } from "../../api/collections/useCollectionQueries.js";
import { CollectionItemsDisplay } from "../CollectionItemsDisplay/CollectionItemsDisplay.js";
import { PiMusicNotesPlusFill } from "react-icons/pi";
import { Audio } from "../AudioService/AudioContext.js";
import CreateCollectionDialog from "../../components/CollectionView/components/CreateCollectionDialog.js";
import { useCollectionMutations } from "../CollectionItemsDisplay/hooks/useCollectionMutations.js";

import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import "./PlaylistPanel.css";

interface PlaylistPanelProps {
  onPlaylistCountChange?: (count: number) => void;
}

const PlaylistPanel: React.FC<PlaylistPanelProps> = React.memo(
  ({ onPlaylistCountChange }) => {
    // Get audio context functionality
    const {
      toggleAudioItem,
      isAudioItemPlaying,
      playlist: { togglePlaylist, currentIndex },
    } = Audio.useAudio();
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
      null
    );
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const { data: playlistCollection } = useGetCollectionsOfType("playlist");
    const playlists = playlistCollection?.items || [];

    const { createCollection } = useCollectionMutations(
      -1, // Virtual collection ID
      "playlist",
      {
        onAddSuccess: () => {
          setCreateDialogOpen(false);
        },
      }
    );

    // Memoize the selected playlist to prevent unnecessary lookups
    const selectedPlaylist = useMemo(
      () => playlists?.find((playlist) => playlist.id === selectedPlaylistId),
      [playlists, selectedPlaylistId]
    );

    const handleBackClick = useCallback(() => {
      setSelectedPlaylistId(null);
    }, []);

    const handlePlaylistSelect = useCallback((itemId: number) => {
      setSelectedPlaylistId(itemId);
    }, []);

    const handleTogglePlay = useCallback(() => {
      if (selectedPlaylist) {
        togglePlaylist(selectedPlaylistId!, currentIndex);
      }
    }, [selectedPlaylist, toggleAudioItem, selectedPlaylistId, currentIndex]);

    const handleOpenCreateDialog = useCallback(() => {
      setCreateDialogOpen(true);
    }, []);

    // Use effect to notify parent when playlist count changes
    useEffect(() => {
      if (onPlaylistCountChange && playlists) {
        onPlaylistCountChange(playlists.length);
      }
    }, [playlists, onPlaylistCountChange]);

    const listViewProps = {
      collectionType: "playlist" as const,
      collectionId: -1,
      view: "list" as const,
      showToggle: false,
      showHeaders: false,
      showPlayButton: true,
      onItemClick: handlePlaylistSelect,
      isDragSource: true,
      isReorderable: true,
      isDropTarget: true,
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
      dropZoneId: DROP_ZONES.SOUND_MANAGER_PLAYLIST,
      acceptedDropTypes: ["file"],
    };

    return (
      <div className="playlist-panel">
        {!selectedPlaylistId ? (
          <>
            <div className="panel-header">
              <h3>Playlists</h3>
              <button
                className="create-collection-button"
                onClick={handleOpenCreateDialog}
                title="Create New Playlist"
              >
                <PiMusicNotesPlusFill />
              </button>
            </div>
            
            <CollectionItemsDisplay {...listViewProps} />
            

            {createDialogOpen && (
              <CreateCollectionDialog
                isOpen={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
                collectionType="playlist"
                createCollection={createCollection!}
                isLoading={false}
              />
            )}
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
                title={
                  isAudioItemPlaying(selectedPlaylist) ? "Pause" : "Play all"
                }
              >
                {isAudioItemPlaying(selectedPlaylist) ? "⏸" : "▶"}
              </button>
            </div>
            <CollectionItemsDisplay {...detailViewProps} />
          </>
        ) : null}
      </div>
    );
  }
);

export default PlaylistPanel;
