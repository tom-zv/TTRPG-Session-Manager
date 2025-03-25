import React from 'react';
import CollectionEditView from './CollectionEditView/CollectionEditView.js';
import { playlistApi, sfxApi, ambienceApi, packApi} from '../api/collections/collectionApi.js';

const PlaylistManager: React.FC = () => {
  return (
    <CollectionEditView
      collectionType="playlist"
      collectionName="Playlists"
      fetchCollections={playlistApi.getAllCollections}
      fetchCollectionItems={playlistApi.getCollectionFiles}
      onCreateCollection={playlistApi.createCollection}
      onUpdateCollection={(collection) => 
        playlistApi.updateCollection(collection.id, collection.name, collection.description)
      }
      onDeleteCollection={playlistApi.deleteCollection}
      onAddItems={playlistApi.addToCollection}
      onRemoveItems={playlistApi.removeFilesFromCollection}
      onUpdateItemPosition={playlistApi.updatePosition}
    />
  );
};

const SoundEffectManager: React.FC = () => {
  return (
    <CollectionEditView
      collectionType="sfx"
      collectionName="Sound Effect Collections"
      fetchCollections={sfxApi.getAllCollections}
      fetchCollectionItems={sfxApi.getCollectionFiles}
      onCreateCollection={sfxApi.createCollection}
      onUpdateCollection={(collection) => 
        sfxApi.updateCollection(collection.id, collection.name, collection.description)
      }
      onDeleteCollection={sfxApi.deleteCollection}
      onAddItems={sfxApi.addToCollection}
      onRemoveItems={sfxApi.removeFilesFromCollection}
      onUpdateItemPosition={sfxApi.updatePosition}
    />
  );
}

const AmbienceManager: React.FC = () => {
  return (
    <CollectionEditView
      collectionType="ambience"
      collectionName="Ambience Collections"
      fetchCollections={ambienceApi.getAllCollections}
      fetchCollectionItems={ambienceApi.getCollectionFiles}
      onCreateCollection={ambienceApi.createCollection}
      onUpdateCollection={(collection) => 
        ambienceApi.updateCollection(collection.id, collection.name, collection.description)
      }
      onDeleteCollection={ambienceApi.deleteCollection}
      onAddItems={ambienceApi.addToCollection}
      onRemoveItems={ambienceApi.removeFilesFromCollection}
      onUpdateItemPosition={ambienceApi.updatePosition}
    />
  );
}

const PackManager: React.FC = () => {
  return (
    <CollectionEditView
      collectionType="pack"
      collectionName="Packs"
      fetchCollections={packApi.getAllPacks}
      fetchCollectionItems={ packApi.getPackCollections } // Placeholder 
      onCreateCollection={packApi.createPack}
      onUpdateCollection={() => Promise.resolve(true)} // Placeholder 
      onDeleteCollection={packApi.deletePack}
      onAddItems={() => Promise.resolve(true)} // Placeholder 
      onRemoveItems={() => Promise.resolve(true)} // Placeholder 
      onUpdateItemPosition={() => Promise.resolve(true)} // Placeholder 
    />
  );
}

export { PlaylistManager, SoundEffectManager, AmbienceManager, PackManager };