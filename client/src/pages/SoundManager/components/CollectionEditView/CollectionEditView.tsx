import React, { useEffect, useState } from "react";
import type { CollectionEditViewProps } from "./types.js";
import type { AudioItem } from "./types.js";
import { useCollections } from "./hooks/useCollections.js";
import CollectionsGrid from "./components/CollectionsGrid.js";
import CollectionDetail from "./components/CollectionDetail.js";
import CreateCollectionDialog from "./components/CreateCollectionDialog.js";
import "./CollectionEditView.css";

const CollectionEditView: React.FC<CollectionEditViewProps> = (props) => {
  const {
    collectionTitle,
    collectionType,
    fetchCollections,
    fetchCollectionItems,
    onCreateCollection,
    onDeleteCollection,
    onAddItem,
    onRemoveItem,
  } = props;

  // Collections state and methods from hook
  const collections = useCollections({
    collectionTitle,
    collectionType,
    fetchCollections,
    fetchCollectionItems,
    onCreateCollection,
    onDeleteCollection,
    onAddItem,
    onRemoveItem,
  });
  
  // State for error and loading management
  const [isLoading, setIsLoading] = useState(collections.isLoading);
  const [error, setError] = useState(collections.error);
  
  // Update local state when hook state changes
  useEffect(() => {
    setIsLoading(collections.isLoading);
    setError(collections.error);
  }, [collections.isLoading, collections.error]);

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
    <div className="collection-edit-view">
      {collections.viewMode === "grid" ? (
        <CollectionsGrid
          collectionTitle={collectionTitle}
          collectionType={collectionType}
          collections={collections.collectionsAsAudioItems}
          isLoading={isLoading}
          error={error}
          onCreateCollection={onCreateCollection}
          onItemClick={handleItemClick}
          onDeleteClick={collections.handleDeleteCollection}
        />
      ) : (
        collections.selectedCollection && (
          <CollectionDetail
            collection={collections.selectedCollection}
            collectionItems={collections.collectionItems}
            isLoading={isLoading}
            error={error}
            onBackClick={collections.handleBackToCollections}
            onRemoveItem={collections.handleRemoveItem}
            handleAddItem={collections.handleAddItem}
            setError={setError}
          />
        )
      )}
      
      <CreateCollectionDialog
        isOpen={collections.isCreateDialogOpen}
        onClose={() => collections.setIsCreateDialogOpen(false)}
        collectionTitle={collectionTitle}
        collectionType={collectionType}
        newItemName={collections.newItemName}
        newItemDescription={collections.newItemDescription}
        setNewItemName={collections.setNewItemName}
        setNewItemDescription={collections.setNewItemDescription}
        onCreateCollection={collections.handleCreateCollection}
        isLoading={isLoading}
      />
    </div>
  );
};

export default CollectionEditView;