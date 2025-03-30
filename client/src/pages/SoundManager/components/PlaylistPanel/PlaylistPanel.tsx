import React, { useEffect } from "react";
import { playlistApi } from "../../api/collections/collectionApi.js";
import { useCollections } from "../CollectionView/hooks/useCollections.js";
import { useItemPanel } from "../ItemPanel/ItemPanelContext.js";
import AudioItemsDisplay from "../AudioItemDisplay/AudioItemsDisplay.js";
import "./PlaylistPanel.css";

const PlaylistPanel: React.FC = () => {
  // Get the isPanelActive state from ItemPanelContext
  const { isItemPanelActive } = useItemPanel();

  // Hook to manage Playlists
  const playlists = useCollections({
    collectionName: "playlists",
    collectionType: "playlist",
    fetchCollections: playlistApi.getAllCollections,
    fetchCollectionItems: playlistApi.getCollectionFiles,
    onCreateCollection: playlistApi.createCollection,
    onDeleteCollection: playlistApi.deleteCollection,
    onEditItem: playlistApi.updateItem,
    onRemoveItems: playlistApi.removeFilesFromCollection,
    onUpdateItemPosition: playlistApi.updatePosition,
  });

  useEffect(() => {
    playlists.loadCollections();
  }, []);

  const handlePlaylistClick = (playlistId: number) => {
    const selectedCollection = playlists.collections.find((playlist) => playlist.id === playlistId);
    if (!selectedCollection) {
      console.error("Playlist not found");
      return;
    }

    playlists.handleSelectCollection(selectedCollection);
    playlists.loadCollectionItems(playlistId);
  };

  // Function to handle going back to all playlists
  const handleBackClick = () => {
    playlists.handleSelectCollection(null);
  };

  // Function to handle playing a playlist
  const handlePlayPlaylist = (playlistId: number) => {
    console.log("Playing playlist:", playlistId);
    // playlist playback logic
  };

  // Function to handle playing a playlist item
  const handlePlayItem = (itemId: number) => {
    console.log("Playing item:", itemId);
    // item playback logic
  };

  // Don't render if the ItemPanel is active
  if (isItemPanelActive) {
    return null;
  }

  return (
    <div className="playlist-panel">
      {!playlists.selectedCollection ? (
        <>
          <div className="panel-header">
            <h3>Playlists</h3>
          </div>
          <AudioItemsDisplay
            items={playlists.collections}
            collectionType="pack"
            view="list"
            showToggle={false}
            showHeaders={false}
            showPlayButton={true}
            onItemClick={handlePlaylistClick}
            onPlayItem={handlePlayPlaylist}
            isDragSource={false}
            isReorderable={false}
            isDropTarget={false}
          />
        </>
      ) : (
        <>
          <div className="panel-header">
            <button className="back-button" onClick={handleBackClick}>
              ←
            </button>
            <h3>{playlists.selectedCollection.name}</h3>
            <button
              className="play-all-button"
              onClick={() => handlePlayPlaylist(playlists.selectedCollection!.id)}
              title="Play all"
            >
              ▶
            </button>
          </div>
          <AudioItemsDisplay
            items={playlists.collectionItems}
            collectionType={"playlist"}
            isEditing={true}
            isLoading={playlists.isLoading}
            error={playlists.error}
            view="list"
            showToggle={false}
            showHeaders={true}
            showActions={true}
            onAddItems={playlists.handleAddItems}
            onEditItem={playlists.handleEditItem}
            onRemoveItems={playlists.handleRemoveItems}
            onPlayItem={handlePlayItem}
            onUpdateItemPosition={playlists.handleUpdateItemPositions}
            isDragSource={true}
            isReorderable={true}
            isDropTarget={true}
            acceptedDropTypes={["file"]}
          />
        </>
      )}
    </div>
  );
};

export default PlaylistPanel;
