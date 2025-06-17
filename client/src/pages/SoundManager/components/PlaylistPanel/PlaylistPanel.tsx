import React, { useState, useMemo, useCallback } from "react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { useGetCollectionsOfType } from "../../api/collections/useCollectionQueries.js";
import { CollectionItemsDisplay } from "../CollectionItemsDisplay/CollectionItemsDisplay.js";
import { PiMusicNotesPlusFill } from "react-icons/pi";
import { Audio } from "../../services/AudioService/AudioContext.js";
import CreateCollectionDialog from "../../components/CollectionView/components/CreateCollectionDialog.js";
import { useCollectionMutations } from "../CollectionItemsDisplay/hooks/useCollectionActions.js";
import { usePlaylistPanelSizeCalc } from "../../hooks/usePlaylistPanelSizeCalc.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import "./PlaylistPanel.css";
import { AudioCollection } from "../CollectionItemsDisplay/types.js";

interface PlaylistPanelProps {
  panelRef: React.RefObject<ImperativePanelHandle>;
}

const PlaylistPanel: React.FC<PlaylistPanelProps> = React.memo(
  function PlaylistPanel({ panelRef }) {
    // Get audio context functionality
    const {
      isAudioItemPlaying,
      playlist: { togglePlaylist, currentIndex },
    } = Audio.useAudio();
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
      null
    );
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const { data: playlistCollection } = useGetCollectionsOfType("playlist");
    const playlists = useMemo(
      () => playlistCollection?.items || [],
      [playlistCollection]
    );

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
    ) as AudioCollection | undefined;

    const handleTogglePlay = useCallback(() => {
      if (selectedPlaylist) {
        togglePlaylist(selectedPlaylistId!, currentIndex);
      }
    }, [selectedPlaylist, togglePlaylist, selectedPlaylistId, currentIndex]);

    const handlePlaylistSelect = useCallback((itemId: number) => {
      setSelectedPlaylistId(itemId);
    }, []);

    const isDetail = selectedPlaylistId !== null;
    const itemCount = isDetail
      ? selectedPlaylist?.items?.length || 0
      : playlists.length;
    usePlaylistPanelSizeCalc(itemCount, panelRef);

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
              <div className="panel-header-actions">
                <button
                  className="create-collection-button"
                  onClick={() => setCreateDialogOpen(true)}
                  title="Create New Playlist"
                >
                  <PiMusicNotesPlusFill />
                </button>
              </div>
            </div>

            <CollectionItemsDisplay {...listViewProps} />

            {createDialogOpen && (
              <CreateCollectionDialog
                isOpen={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
                collectionType="playlist"
                createCollection={createCollection!}
              />
            )}
          </>
        ) : selectedPlaylist ? (
          <>
            <div className="panel-header">
              <button
                className="back-button"
                onClick={() => setSelectedPlaylistId(null)}
              >
                ←
              </button>
              <h3>{selectedPlaylist.name}</h3>
              <button
                className={`play-all-button ${
                  isAudioItemPlaying(selectedPlaylist) ? "playing" : ""
                }`}
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

PlaylistPanel.displayName = "PlaylistPanel";

export default PlaylistPanel;
