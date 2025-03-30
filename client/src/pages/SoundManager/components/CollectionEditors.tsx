import React from 'react';
import CollectionView from './CollectionView/CollectionView.js';
import { playlistApi, sfxApi, ambienceApi, packApi, macroApi} from '../api/collections/collectionApi.js';

const PlaylistEditor: React.FC = () => {
  return (
    <CollectionView
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

const SoundEffectEditor: React.FC = () => {
  return (
    <CollectionView
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

const AmbienceEditor: React.FC = () => {
  return (
    <CollectionView
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

const PackEditor: React.FC = () => {
  return (
    <CollectionView
      collectionType="pack"
      collectionName="Packs"
      fetchCollections={packApi.getAllPacks}
      fetchCollectionItems={ packApi.getPackCollections } 
      onCreateCollection={packApi.createPack}
      onUpdateCollection={() => Promise.resolve(true)} // Placeholder 
      onDeleteCollection={packApi.deletePack}
      onAddItems={() => Promise.resolve(true)} // Placeholder 
      onRemoveItems={() => Promise.resolve(true)} // Placeholder 
      onUpdateItemPosition={() => Promise.resolve(true)} // Placeholder 
    />
  );
}

const MacroEditor: React.FC = () => {
  return (
    <CollectionView
      collectionType="macro"
      collectionName="Macros"
      fetchCollections={macroApi.getAllCollections}
      fetchCollectionItems={macroApi.getCollectionFiles}
      onCreateCollection={macroApi.createCollection}
      onUpdateCollection={(collection) =>
        macroApi.updateCollection(
          collection.id,
          collection.name,
          collection.description
        )
      }
      onDeleteCollection={macroApi.deleteCollection}
      onAddItems={macroApi.addToCollection}
      onEditItem={macroApi.editItem}
      onRemoveItems={macroApi.removeFilesFromCollection}
      onUpdateItemPosition={macroApi.updatePosition}
    />
  );
}

export { PlaylistEditor, SoundEffectEditor, AmbienceEditor, PackEditor, MacroEditor };