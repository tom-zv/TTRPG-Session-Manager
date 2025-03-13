import { useState, useCallback } from 'react';
import { AudioItem, CollectionType } from '../types.js';

interface UseCollectionsProps {
  collectionTitle: string;
  collectionType: CollectionType;
  fetchCollections: () => Promise<AudioItem[]>;
  fetchCollectionItems?: (collectionId: number) => Promise<AudioItem[]>;
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onDeleteCollection?: (collectionId: number) => Promise<boolean>;
  onAddItem?: (collectionId: number, itemId: number) => Promise<boolean>;
  onRemoveItem?: (collectionId: number, itemId: number) => Promise<boolean>;
}

export const useCollections = ({
  collectionType,
  collectionTitle,
  fetchCollections,
  fetchCollectionItems,
  onCreateCollection,
  onDeleteCollection,
  onAddItem,
  onRemoveItem
}: UseCollectionsProps) => {
  // Collections data
  const [collections, setCollections] = useState<AudioItem[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<AudioItem | null>(null);
  const [collectionItems, setCollectionItems] = useState<AudioItem[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "detail">("grid");

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(false);
  const [newItemName, setNewItemName] = useState<string>("");
  const [newItemDescription, setNewItemDescription] = useState<string>("");

  // Load all collections
  const loadCollections = useCallback(async () => {
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
  }, [fetchCollections, collectionTitle]);

  // Load a specific collection's items
  const loadCollectionItems = useCallback(async (collectionId: number) => {
    if (!fetchCollectionItems) return;

    setIsLoading(true);
    setError(null);

    try {
      const items = await fetchCollectionItems(collectionId);
      setCollectionItems(items);
    } catch (err) {
      console.error(`Error loading collection items for ID ${collectionId}:`, err);
      setError(`Failed to load items. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  }, [fetchCollectionItems]);

  // Handle collection selection
  const handleSelectCollection = useCallback(async (collection: AudioItem) => {
    setSelectedCollection(collection);
    setViewMode("detail");

    if (fetchCollectionItems) {
      await loadCollectionItems(collection.id);
    }
  }, [fetchCollectionItems, loadCollectionItems]);

  // Handle creating a new collection
  const handleCreateCollection = useCallback(async () => {
    if (!onCreateCollection || !newItemName) return;

    // Create optimistic collection
    const optimisticCollection: AudioItem = {
      id: -Date.now(), // Temporary negative ID to avoid conflicts
      title: newItemName,
      description: newItemDescription || undefined,
      type: collectionType,
      itemCount: 0
    };

    // Optimistically update UI
    setCollections(prev => [...prev, optimisticCollection]);
    setIsCreateDialogOpen(false);
    setNewItemName("");
    setNewItemDescription("");

    try {
      // Make the actual API call
      const newCollectionId = await onCreateCollection(newItemName, newItemDescription);
      
      // Replace optimistic collection with real one
      setCollections(prev => prev.map(collection => 
        collection.id === optimisticCollection.id 
          ? { ...optimisticCollection, id: newCollectionId }
          : collection
      ));
    } catch (err) {
      console.error("Error creating collection:", err);
      
      // Remove optimistic collection and show error
      setCollections(prev => prev.filter(c => c.id !== optimisticCollection.id));
      setError(`Failed to create ${collectionType}. Please try again.`);
      
      // Reopen dialog with previous values to let user try again
      setIsCreateDialogOpen(true);
    }
  }, [onCreateCollection, newItemName, newItemDescription, collectionType]);

  // Handle deleting a collection
  const handleDeleteCollection = useCallback(async (collectionId: number) => {
    if (!onDeleteCollection) return;

    if (
      !window.confirm(
        `Are you sure you want to delete this ${collectionType}? This cannot be undone.`
      )
    ) {
      return;
    }

    // Store collection for potential rollback
    const deletedCollection = collections.find(c => c.id === collectionId);
    if (!deletedCollection) return;

    // Optimistically remove from UI
    setCollections(prev => prev.filter(c => c.id !== collectionId));

    // If we deleted the currently selected collection, go back to grid view
    if (selectedCollection && selectedCollection.id === collectionId) {
      setSelectedCollection(null);
      setViewMode("grid");
    }

    try {
      // Make the actual API call
      await onDeleteCollection(collectionId);
    } catch (err) {
      console.error(`Error deleting collection ID ${collectionId}:`, err);
      
      // Restore the deleted collection
      setCollections(prev => [...prev, deletedCollection]);
      setError(`Failed to delete ${collectionType}. Please try again.`);
    }
  }, [onDeleteCollection, selectedCollection, collections, collectionType]);

  // Handle adding an item to the collection
  const handleAddItem = useCallback(async (audioItem: AudioItem) => {
    if (!onAddItem || !selectedCollection) return;
    // if the item is already in the collection, do nothing
    if (collectionItems.some((item) => item.id === audioItem.id)) return;
    // Optimistically add to UI
    
    setCollectionItems((prev) => [...prev, audioItem]);
    

    try {
      // Make the actual API call
      await onAddItem(selectedCollection.id, audioItem.id);
    } catch (err) {
      console.error("Error adding item to collection:", err);
      
      // Remove optimistic item
      setCollectionItems(prev => prev.filter(item => item.id !== audioItem.id));
      setError(`Failed to add item to ${collectionType}. Please try again.`);
    }
  }, [onAddItem, selectedCollection, collectionType]);

  // Handle removing an item from the collection
  const handleRemoveItem = useCallback(async (itemId: number) => {
    if (!onRemoveItem || !selectedCollection) return;

    // Find the item to be removed
    const removedItem = collectionItems.find(item => item.id === itemId);
    if (!removedItem) return;

    // Optimistically remove from UI
    setCollectionItems(prev => prev.filter(item => item.id !== itemId));

    try {
      // Make the actual API call
      await onRemoveItem(selectedCollection.id, itemId);
    } catch (err) {
      console.error("Error removing item from collection:", err);
      
      // Restore the removed item
      setCollectionItems(prev => [...prev, removedItem]);
      setError(`Failed to remove item from ${collectionType}. Please try again.`);
    }
  }, [onRemoveItem, selectedCollection, collectionItems, collectionType]);

  // Return to the collections grid view
  const handleBackToCollections = useCallback(() => {
    setSelectedCollection(null);
    setCollectionItems([]);
    setViewMode("grid");
  }, []);

  // Convert collections to AudioItem format for AudioItemList component
  const collectionsAsAudioItems = collections.map((collection) => ({
    id: collection.id,
    title: collection.title,
    type: collection.type,
    itemCount: collection.itemCount || 0,
  }));

  return {
    // State
    collections,
    selectedCollection,
    collectionItems,
    isLoading,
    error,
    viewMode,
    isCreateDialogOpen,
    newItemName,
    newItemDescription,
    collectionsAsAudioItems,
    
    // Setters
    setIsCreateDialogOpen,
    setNewItemName,
    setNewItemDescription,
    
    // Actions
    loadCollections,
    loadCollectionItems,
    handleSelectCollection,
    handleCreateCollection,
    handleDeleteCollection,
    handleAddItem,
    handleRemoveItem,
    handleBackToCollections,
  };
};