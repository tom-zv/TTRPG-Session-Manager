import React, { useEffect } from "react";
import type { CollectionViewProps } from "./types.js";
import { useCollections } from "./hooks/useCollections.js";
import CollectionsGrid from "./components/CollectionsGrid.js";
import CollectionDetail from "./components/CollectionDetail.js";
import CreateCollectionDialog from "./components/CreateCollectionDialog.js";
import "./CollectionView.css";

const CollectionView: React.FC<CollectionViewProps> = (props) => {
  const {
    collectionName,
    collectionType,
    fetchCollections,
    fetchCollectionItems,
    onCreateCollection,
    onDeleteCollection,
    onAddItems,
    onEditItem,
    onRemoveItems,
    onUpdateItemPosition,
    // UI props
    itemDisplayView,
    isEditing,
  } = props;

  // Collections state and methods from hook
  const collections = useCollections({
    collectionName,
    collectionType,
    fetchCollections,
    fetchCollectionItems,
    onCreateCollection,
    onDeleteCollection,
    onAddItems,
    onEditItem,
    onRemoveItems,
    onUpdateItemPosition
  });
  
  // Load collections when component mounts
  useEffect(() => {
    collections.loadCollections();
  }, [collectionType]);

  // Handle collection item click
  const handleItemClick = (itemId: number) => {
    // Special case for our "Create New" button
    if (itemId === -1) {
      collections.setIsCreateDialogOpen(true);
      return;
    }

    // Regular collection item
    const collection = collections.collections.find((c) => c.id === itemId);
    if (collection) {
      collections.handleSelectCollection(collection);
    }
  };

  return (
    <div className="collection-view">
      {collections.viewMode === "grid" ? (
        <CollectionsGrid
          collectionName={collectionName}
          collectionType={collectionType}
          collections={collections.collections}
          isLoading={collections.isLoading}
          error={collections.error}
          onCreateCollection={onCreateCollection}
          onItemClick={handleItemClick}
          onDeleteClick={collections.handleDeleteCollection}
          isDragSource={true}
          isDropTarget={false}
        />
      ) : (
        collections.selectedCollection && (
        <CollectionDetail
          collection={collections.selectedCollection}
          collectionType={collectionType}
          collectionItems={collections.collectionItems}
          itemDisplayView={itemDisplayView || "list"}
          isEditing={isEditing || false}
          isLoading={collections.isLoading}
          error={collections.error}
          onBackClick={collections.handleBackToCollections}
          onAddItems={collections.handleAddItems}
          onRemoveItems={collections.handleRemoveItems}
          onEditItem={collections.handleEditItem}
          onUpdateItemPosition={collections.handleUpdateItemPositions}
          isDragSource={true}
          isDropTarget={true}
        />
        )
      )}
      
      <CreateCollectionDialog
        isOpen={collections.isCreateDialogOpen}
        onClose={() => collections.setIsCreateDialogOpen(false)}
        collectionName={collectionName}
        collectionType={collectionType}
        newItemName={collections.newItemName}
        newItemDescription={collections.newItemDescription}
        setNewItemName={collections.setNewItemName}
        setNewItemDescription={collections.setNewItemDescription}
        onCreateCollection={collections.handleCreateCollection}
        isLoading={collections.isLoading}
      />
    </div>
  );
};

export default CollectionView;