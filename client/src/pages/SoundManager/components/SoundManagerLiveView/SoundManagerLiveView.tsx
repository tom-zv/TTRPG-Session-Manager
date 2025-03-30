import React from "react";
import CollectionView from "../../components/CollectionView/CollectionView.js";
import { sfxApi, ambienceApi } from "../../api/collections/collectionApi.js";


const SoundManagerLiveView: React.FC = () => {
  

  return (
    <>
      <CollectionView
        collectionType="sfx"
        collectionName="Sound Effect Collections"
        fetchCollections={sfxApi.getAllCollections}
        fetchCollectionItems={sfxApi.getCollectionFiles}
        onCreateCollection={sfxApi.createCollection}
        onUpdateCollection={(collection) =>
          sfxApi.updateCollection(
            collection.id,
            collection.name,
            collection.description
          )
        }
        onDeleteCollection={sfxApi.deleteCollection}
        onAddItems={sfxApi.addToCollection}
        onRemoveItems={sfxApi.removeFilesFromCollection}
        onUpdateItemPosition={sfxApi.updatePosition}
        itemDisplayView="grid"
        
      />

      <div className="layout-horizontal-separator"></div>

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
      itemDisplayView="grid"
    />
    </>
  );
};
export default SoundManagerLiveView;
