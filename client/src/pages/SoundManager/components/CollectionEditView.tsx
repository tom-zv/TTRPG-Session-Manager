import React, { useState, useEffect } from "react";
import AudioItemList, { AudioItem } from "./AudioItemList.js";
import "./CollectionEditView.css";

// Collection types supported by the component
export type CollectionType = "playlist" | "sfx_set" | "ambience_set" | "pack";

// Basic collection interface that all types must implement
export interface Collection {
  id: number;
  name: string;
  description?: string;
  type: CollectionType;
  itemCount?: number;
}

// Props for the CollectionEditView component
interface CollectionEditViewProps {
  // Type of collections to display and edit
  collectionType: CollectionType;

  // Display name for this collection type
  collectionTitle: string;

  // API Functions
  fetchCollections: () => Promise<Collection[]>;
  fetchCollectionItems?: (collectionId: number) => Promise<AudioItem[]>;
  fetchAvailableItems?: (collectionId?: number) => Promise<AudioItem[]>;

  // Action Handlers
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onUpdateCollection?: (collection: Collection) => Promise<boolean>;
  onDeleteCollection?: (collectionId: number) => Promise<boolean>;
  onAddItem?: (collectionId: number, itemId: number) => Promise<boolean>;
  onRemoveItem?: (collectionId: number, itemId: number) => Promise<boolean>;
  onReorderItem?: (
    collectionId: number,
    itemId: number,
    newOrder: number
  ) => Promise<boolean>;
}

const CollectionEditView: React.FC<CollectionEditViewProps> = ({
  collectionType,
  collectionTitle,
  fetchCollections,
  fetchCollectionItems,
  onCreateCollection,
  //onUpdateCollection,
  onDeleteCollection,
  onAddItem,
  onRemoveItem,
  //onReorderItem
}) => {
  // View state - 'grid' for collections list, 'detail' for a specific collection
  const [viewMode, setViewMode] = useState<"grid" | "detail">("grid");

  // Collections data
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] =
    useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<AudioItem[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(false);
  const [newItemName, setNewItemName] = useState<string>("");
  const [newItemDescription, setNewItemDescription] = useState<string>("");

  // Add this state at the beginning of the component
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Add new state for tracking number of files being dragged
  const [dragCount, setDragCount] = useState<number>(0);

  // Load all collections when component mounts
  useEffect(() => {
    loadCollections();
  }, [collectionType]);

  // Load all collections
  const loadCollections = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCollections();
      setCollections(data);
    } catch (err) {
      console.error("Error loading collections:", err);
      setError(
        `Failed to load ${collectionTitle.toLowerCase()}. Please try again.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Load a specific collection's items
  const loadCollectionItems = async (collectionId: number) => {
    if (!fetchCollectionItems) return;

    setIsLoading(true);
    setError(null);

    try {
      const items = await fetchCollectionItems(collectionId);
      setCollectionItems(items);
    } catch (err) {
      console.error(
        `Error loading collection items for ID ${collectionId}:`,
        err
      );
      setError(`Failed to load items. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle collection selection
  const handleSelectCollection = async (collection: Collection) => {
    setSelectedCollection(collection);
    setViewMode("detail");

    if (fetchCollectionItems) {
      await loadCollectionItems(collection.id);
    }
  };

  // Handle creating a new collection
  const handleCreateCollection = async () => {
    if (!onCreateCollection || !newItemName) return;

    setIsLoading(true);
    setError(null);

    try {
      await onCreateCollection(newItemName, newItemDescription);
      setNewItemName("");
      setNewItemDescription("");
      setIsCreateDialogOpen(false);
      await loadCollections();
    } catch (err) {
      console.error("Error creating collection:", err);
      setError(`Failed to create ${collectionType}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle deleting a collection
  const handleDeleteCollection = async (collectionId: number) => {
    if (!onDeleteCollection) return;

    if (
      !window.confirm(
        `Are you sure you want to delete this ${collectionType}? This cannot be undone.`
      )
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onDeleteCollection(collectionId);

      // If we deleted the currently selected collection, go back to grid view
      if (selectedCollection && selectedCollection.id === collectionId) {
        setSelectedCollection(null);
        setViewMode("grid");
      }

      await loadCollections();
    } catch (err) {
      console.error(`Error deleting collection ID ${collectionId}:`, err);
      setError(`Failed to delete ${collectionType}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle adding an item to the collection
  const handleAddItem = async (itemId: number) => {
    if (!onAddItem || !selectedCollection) return;

    setIsLoading(true);
    setError(null);

    try {
      await onAddItem(selectedCollection.id, itemId);

      // Refresh both the collection items and available items
      if (fetchCollectionItems) {
        await loadCollectionItems(selectedCollection.id);
      }
    } catch (err) {
      console.error("Error adding item to collection:", err);
      setError(`Failed to add item to ${collectionType}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle removing an item from the collection
  const handleRemoveItem = async (itemId: number) => {
    if (!onRemoveItem || !selectedCollection) return;

    setIsLoading(true);
    setError(null);

    try {
      await onRemoveItem(selectedCollection.id, itemId);

      // Refresh collection items
      if (fetchCollectionItems) {
        await loadCollectionItems(selectedCollection.id);
      }
    } catch (err) {
      console.error("Error removing item from collection:", err);
      setError(
        `Failed to remove item from ${collectionType}. Please try again.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Return to the collections grid view
  const handleBackToCollections = () => {
    setSelectedCollection(null);
    setCollectionItems([]);
    setViewMode("grid");
  };

  // Convert collections to AudioItem format for AudioItemList component
  const collectionsAsAudioItems = collections.map((collection) => ({
    id: collection.id,
    title: collection.name,
    type: collection.type,
    itemCount: collection.itemCount || 0,
  }));

  // Render create collection dialog
  const renderCreateCollectionDialog = () => {
    if (!isCreateDialogOpen) return null;

    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h2>Create New {collectionTitle.slice(0, -1)}</h2>
            <button
              className="close-button"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="newItemName">Name:</label>
              <input
                id="newItemName"
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={`Enter ${collectionType} name`}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newItemDescription">Description:</label>
              <textarea
                id="newItemDescription"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                placeholder="Enter description (optional)"
                rows={3}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button
              className="create-button"
              onClick={handleCreateCollection}
              disabled={!newItemName || isLoading}
            >
              Create
            </button>
            <button
              className="cancel-button"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render the grid view of collections
  const renderCollectionsGrid = () => {
    // Create a special AudioItem for the "Create New" button
    const createNewItem = {
      id: -1, // Use a special ID that won't conflict with real items
      title: `Create New ${collectionTitle.slice(0, -1)}`,
      type: collectionType,
      itemCount: 0,
      isCreateButton: true // Custom property to identify this special item
    };

    // Add the create button to the list if we have the function to create collections
    const displayItems = [...collectionsAsAudioItems];
    if (onCreateCollection) {
      displayItems.push(createNewItem);
    }

    const handleItemClick = (itemId: number) => {
      // Special case for our "Create New" button
      if (itemId === -1) {
        setIsCreateDialogOpen(true);
        return;
      }

      // Regular collection item
      const collection = collections.find((c) => c.id === itemId);
      if (collection) {
        handleSelectCollection(collection);
      }
    };

    const handleDeleteClick = (itemId: number) => {
      if (itemId !== -1) { // Don't allow deleting our create button
        handleDeleteCollection(itemId);
      }
    };

    return (
      <div className="collections-grid-view">
        <div className="collections-header">
          <h2>{collectionTitle}</h2>
        </div>
        
        <AudioItemList
          items={displayItems}
          isLoading={isLoading}
          error={error}
          view="grid"
          showToggle={false}
          showActions={true}
          title={collectionTitle}
          onItemClick={handleItemClick}
          onDeleteItem={onDeleteCollection ? handleDeleteClick : undefined}
          renderSpecialItem={(item) => 
            item.isCreateButton && (
              <div className="create-collection-content">
                <div className="create-collection-icon">+</div>
                <span className="create-collection-text">{item.title}</span>
              </div>
            )
          }
        />
      </div>
    );
  };

  // Render the detail view of a collection
  const renderCollectionDetail = () => {
    if (!selectedCollection) return null;

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
      
      try {
        // Try to extract the drag data to get file count
        const items = e.dataTransfer.items;
        if (items.length > 0) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type === 'application/json') {
              // We have to rely on the dragCount state since we can't read the data during dragenter
              // The actual parsing will happen during drop
              setDragCount(1); // At minimum 1, exact count determined on drop
              break;
            }
          }
        }
      } catch (err) {
        console.log('Could not read drag data type', err);
      }
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      setDragCount(0);
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      
      try {
        const data = e.dataTransfer.getData('application/json');
        if (!data) return;
        
        const fileData = JSON.parse(data);
        
        // Handle single file drop (backward compatibility)
        if (fileData.type === 'audio_file' && onAddItem && selectedCollection) {
          await handleAddItem(fileData.id);
        }
        // Handle multiple files drop
        else if (fileData.type === 'audio_files' && onAddItem && selectedCollection) {
          setIsLoading(true);
          setError(null);
          
          // Add optimistic UI updates
          let tempItems = [...collectionItems];
          const filesToAdd = fileData.files;
          
          try {
            // Process all files one by one
            for (const file of filesToAdd) {
              await onAddItem(selectedCollection.id, file.id);
            }
            
            // Refresh collection items after all files are added
            if (fetchCollectionItems) {
              await loadCollectionItems(selectedCollection.id);
            }
          } catch (error) {
            console.error("Error adding multiple items to collection:", error);
            setError(`Failed to add some items to ${collectionType}. Please try again.`);
          } finally {
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error("Error processing dropped item(s):", error);
        setError("Failed to add dropped item(s) to collection");
        setIsLoading(false);
      }
    };

    return (
      <div 
        className={`collection-detail-view ${isDraggingOver ? 'drop-target' : ''}`}
        data-count={dragCount > 1 ? dragCount : ''}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="collection-detail-header">
          <button className="back-button" onClick={handleBackToCollections}>
            ← 
          </button>
          <h2>{selectedCollection.name}</h2>
          {selectedCollection.description && (
            <p className="collection-description">
              {selectedCollection.description}
            </p>
          )}
        </div>

        <AudioItemList
          items={collectionItems}
          isLoading={isLoading}
          error={error}
          showToggle={false}
          showActions={true}
          title="Collection Items"
          onDeleteItem={onRemoveItem ? handleRemoveItem : undefined}
        />
      </div>
    );
  };

  return (
    <div className="collection-edit-view">
      {viewMode === "grid" ? renderCollectionsGrid() : renderCollectionDetail()}
      {renderCreateCollectionDialog()}
    </div>
  );
};

export default CollectionEditView;
