import React from 'react';
import CollectionEditView from './CollectionEditView/CollectionEditView.js';
import playlistApi from '../api/collections/playlistApi.js';

const PlaylistManager: React.FC = () => {
  return (
    <CollectionEditView
      collectionType="playlist"
      collectionTitle="Playlists"
      fetchCollections={playlistApi.getAllPlaylists}
      fetchCollectionItems={playlistApi.getPlaylistFiles}
      onCreateCollection={playlistApi.createPlaylist}
      onUpdateCollection={(collection) => 
        playlistApi.updatePlaylist(collection.id, collection.title, collection.description)
      }
      onDeleteCollection={playlistApi.deletePlaylist}
      onAddItems={playlistApi.addToPlaylist}
      onRemoveItems={playlistApi.removeFilesFromPlaylist}
      onUpdateItemPosition={playlistApi.updatePosition}
    />
  );
};

export default PlaylistManager;