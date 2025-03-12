import React from 'react';
import CollectionEditView from './CollectionEditView.js';
import playlistApi from '../api/playlistApi.js';

const PlaylistManager: React.FC = () => {
  return (
    <CollectionEditView
      collectionType="playlist"
      collectionTitle="Playlists"
      fetchCollections={playlistApi.getAllPlaylists}
      fetchCollectionItems={playlistApi.getPlaylistFiles}
      fetchAvailableItems={playlistApi.getAvailableAudioFiles}
      onCreateCollection={playlistApi.createPlaylist}
      onUpdateCollection={(collection) => 
        playlistApi.updatePlaylist(collection.id, collection.name, collection.description)
      }
      onDeleteCollection={playlistApi.deletePlaylist}
      onAddItem={playlistApi.addFileToPlaylist}
      onRemoveItem={playlistApi.removeFileFromPlaylist}
    />
  );
};

// const sfxSetManager: React.FC = () => {
//   return(
//     <CollectionEditView
//       collectionType="sfx_set"
//       collectionTitle="SFX Sets"
//       fetchCollections=
//       fetchCollectionItems=
//       fetchAvailableItems=
//       onCreateCollection=
//       onUpdateCollection=
//       onDeleteCollection=
//       onAddItem=
//       onRemoveItem=
//     />
//   );
// };

export default PlaylistManager;