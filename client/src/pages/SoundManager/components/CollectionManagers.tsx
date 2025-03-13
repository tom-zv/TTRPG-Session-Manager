import React from 'react';
import CollectionEditView from './CollectionEditView/CollectionEditView.js';
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
        playlistApi.updatePlaylist(collection.id, collection.title, collection.description)
      }
      onDeleteCollection={playlistApi.deletePlaylist}
      onAddItem={playlistApi.addFileToPlaylist}
      onRemoveItem={playlistApi.removeFileFromPlaylist}
    />
  );
};

// Implement SFX Sets manager similar to PlaylistManager
// const SfxSetManager: React.FC = () => {
//   return (
//     <CollectionEditView
//       collectionType="sfx_set"
//       collectionTitle="SFX Sets"
//       fetchCollections={/* Your sfx API function */}
//       fetchCollectionItems={/* Your sfx API function */}
//       fetchAvailableItems={/* Your sfx API function */}
//       onCreateCollection={/* Your sfx API function */}
//       onUpdateCollection={/* Your sfx API function */}
//       onDeleteCollection={/* Your sfx API function */}
//       onAddItem={/* Your sfx API function */}
//       onRemoveItem={/* Your sfx API function */}
//     />
//   );
// };
// export { SfxSetManager };
export default PlaylistManager;