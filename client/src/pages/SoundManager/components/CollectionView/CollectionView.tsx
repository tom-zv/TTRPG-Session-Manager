import React, { useState } from "react";
import type { CollectionViewProps } from "./types.js";
import CollectionsGrid from "./components/CollectionsGrid.js";
import CollectionDetail from "./components/CollectionDetail.js";
import styles from "./CollectionView.module.css";

const CollectionView: React.FC<CollectionViewProps> = (props) => {
  const {
    collectionType,
    // UI props
    itemDisplayView,
    dropZoneId, 
    acceptedDropTypes, 
  } = props;
  
  const [selectedCollectionId, setSelectedCollectionId] = useState<number>(-1);
  const [viewMode, setViewMode] = useState<string>("grid");

  // Handle collection item click
  const handleItemClick = (itemId: number) => {
    // Special case for our "Create New" button
    if (itemId === -1) {
      return;
    }

    setViewMode("detail");
    setSelectedCollectionId(itemId);
  };

  return (
    <div className={styles.collectionView}>
      {viewMode === "grid" ? (
        <CollectionsGrid
          collectionType={collectionType}
          onItemClick={handleItemClick}
          isDragSource={true}
          isDropTarget={false}
        />
      ) : (
        selectedCollectionId > 0 && (
          <CollectionDetail
            collectionType={collectionType}
            collectionId={selectedCollectionId}
            itemDisplayView={itemDisplayView || "list"}
            onBackClick={
              () => {
                setViewMode("grid");
                setSelectedCollectionId(-1);
              }
            }
            isDragSource={true}
            isDropTarget={true}
            dropZoneId={dropZoneId} 
            acceptedDropTypes={acceptedDropTypes} 
          />
        )
      )}
    </div>
  );
};

export default CollectionView;