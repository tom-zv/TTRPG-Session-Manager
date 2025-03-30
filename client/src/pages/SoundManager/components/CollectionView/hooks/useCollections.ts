import { useState, useCallback } from "react";
import { AudioItem, AudioCollection, CollectionType } from "../types.js";

interface UseCollectionsProps {
  // Display metadata
  collectionName: string;
  collectionType: CollectionType;

  // Data fetching
  fetchCollections: () => Promise<AudioCollection[]>;
  fetchCollectionItems?: (collectionId: number) => Promise<AudioItem[]>;

  // Collection operations
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onDeleteCollection?: (collectionId: number) => Promise<boolean>;

  // Item operations
  onAddItems?: (
    collectionId: number,
    itemIds: number[],
    position?: number
  ) => Promise<boolean>;
  onRemoveItems?: (collectionId: number, itemIds: number[]) => Promise<boolean>; // Standardize to arrays only
  onEditItem?: (
    collectionId: number,
    itemId: number,
    params: any
  ) => Promise<boolean>;
  onUpdateItemPosition?: (
    collectionId: number,
    itemId: number,
    targetPosition: number,
    sourceStartPosition?: number,
    sourceEndPosition?: number
  ) => Promise<boolean>;
}

export const useCollections = ({
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
}: UseCollectionsProps) => {
  // Collections data
  const [collections, setCollections] = useState<AudioCollection[]>([]);
  const [selectedCollection, setSelectedCollection] =
    useState<AudioCollection | null>(null);
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
        `Failed to load ${collectionName.toLowerCase()}. Please try again.`
      );
    } finally {
      setIsLoading(false);
    }
  }, [fetchCollections, collectionName]);

  // Load a specific collection's items
  const loadCollectionItems = useCallback(
    async (collectionId: number) => {
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
    },
    [fetchCollectionItems]
  );

  // Handle collection selection
  const handleSelectCollection = useCallback(
    async (collection: AudioCollection| null) => {
      setSelectedCollection(collection);
      setViewMode("detail");

      if (fetchCollectionItems && collection) {
        await loadCollectionItems(collection.id);
      }
    },
    [fetchCollectionItems, loadCollectionItems]
  );

  // Handle creating a new collection
  const handleCreateCollection = useCallback(async () => {
    if (!onCreateCollection || !newItemName) return;

    // Create optimistic collection
    const optimisticCollection: AudioCollection = {
      id: -Date.now(), // Temporary negative ID to avoid conflicts
      name: newItemName,
      description: newItemDescription || undefined,
      type: collectionType,
      itemCount: 0,
    };

    // Optimistically update UI
    setCollections((prev) => [...prev, optimisticCollection]);
    setIsCreateDialogOpen(false);
    setNewItemName("");
    setNewItemDescription("");

    try {
      // Make the actual API call
      const newCollectionId = await onCreateCollection(
        newItemName,
        newItemDescription
      );

      // Replace optimistic collection with real one
      setCollections((prev) =>
        prev.map((collection) =>
          collection.id === optimisticCollection.id
            ? { ...optimisticCollection, id: newCollectionId }
            : collection
        )
      );
    } catch (err) {
      console.error("Error creating collection:", err);

      // Remove optimistic collection and show error
      setCollections((prev) =>
        prev.filter((c) => c.id !== optimisticCollection.id)
      );
      setError(`Failed to create ${collectionType}. Please try again.`);

      // Reopen dialog with previous values to let user try again
      setIsCreateDialogOpen(true);
    }
  }, [onCreateCollection, newItemName, newItemDescription, collectionType]);

  // Handle deleting a collection
  const handleDeleteCollection = useCallback(
    async (collectionIds: number | number[]) => {
      if (!onDeleteCollection) return;

      // Convert to array if single ID is passed
      const idsArray = Array.isArray(collectionIds)
        ? collectionIds
        : [collectionIds];
      if (idsArray.length === 0) return;

      // Confirm deletion with appropriate message based on count
      const confirmMessage =
        idsArray.length === 1
          ? `Are you sure you want to delete this ${collectionType}? This cannot be undone.`
          : `Are you sure you want to delete these ${idsArray.length} ${collectionName.toLowerCase()}? This cannot be undone.`;

      if (!window.confirm(confirmMessage)) {
        return;
      }

      // Store collections for potential rollback
      const deletedCollections = collections.filter((c) =>
        idsArray.includes(c.id)
      );
      if (deletedCollections.length === 0) return;

      // Optimistically remove from UI
      setCollections((prev) => prev.filter((c) => !idsArray.includes(c.id)));

      // If we deleted the currently selected collection, go back to grid view
      if (selectedCollection && idsArray.includes(selectedCollection.id)) {
        setSelectedCollection(null);
        setViewMode("grid");
      }

      try {
        // Make the actual API calls
        for (const id of idsArray) {
          await onDeleteCollection(id);
        }
      } catch (err) {
        console.error(`Error deleting collections:`, err);

        // Restore the deleted collections
        setCollections((prev) => [...prev, ...deletedCollections]);
        setError(`Failed to delete ${collectionType}. Please try again.`);
      }
    },
    [
      onDeleteCollection,
      selectedCollection,
      collections,
      collectionType,
      collectionName,
    ]
  );

  /* Collection item handlers
  ******************************/

  const handleAddItems = useCallback(
    async (audioItems: AudioItem | AudioItem[], position?: number) => {
      if (!onAddItems || !selectedCollection) return;

      // Convert single item to array if needed
      const itemsArray = Array.isArray(audioItems) ? audioItems : [audioItems];
      if (itemsArray.length === 0) return;

      // Filter out items already in collection
      const newItems = itemsArray.filter(
        (item) => !collectionItems.some((existing) => existing.id === item.id)
      );
      if (newItems.length === 0) return;

      // Make a copy of the current items for optimistic update
      const updatedItems = [...collectionItems];
      let insertPosition = position;

      // If no position specified, add at the end
      if (insertPosition === undefined) {
        insertPosition = updatedItems.length;
      }

      // Adjust positions of existing items
      for (let i = 0; i < updatedItems.length; i++) {
        if ((updatedItems[i].position ?? 0) >= insertPosition) {
          updatedItems[i].position =
            (updatedItems[i].position ?? 0) + newItems.length;
        }
      }

      // Insert new items at the specified position
      const itemsToInsert = newItems.map((item, index) => ({
        ...item,
        position: insertPosition + index,
      }));

      // Update state with the new items properly positioned
      setCollectionItems(
        [...updatedItems, ...itemsToInsert].sort(
          (a, b) => (a.position || 0) - (b.position || 0)
        )
      );

      try {
        // Extract item IDs and make the API call with position
        const itemIds = newItems.map((item) => item.id);
        await onAddItems(selectedCollection.id, itemIds, insertPosition);
      } catch (err) {
        console.error("Error adding items to collection:", err);

        // Restore previous state on error
        setCollectionItems(collectionItems);
        setError(`Failed to add items to ${collectionType}. Please try again.`);
      }
    },
    [onAddItems, selectedCollection, collectionItems, collectionType]
  );
  
  const handleEditItem = useCallback(
    async (itemId: number, params: any) => {
      if (!onEditItem || !selectedCollection) return;

      // Find the item to edit
      const itemToEdit = collectionItems.find((item) => item.id === itemId);
      if (!itemToEdit) return;

      // Optimistically update the item
      const updatedItems = collectionItems.map((item) =>
        item.id === itemId ? { ...item, ...params } : item
      );
      
      setCollectionItems(updatedItems);

      try {
        // Make the API call to update the item
        await onEditItem(selectedCollection.id, itemId, params);
      } catch (err) {
        console.error("Error editing item:", err);
        // Restore the original item on error
        setCollectionItems(collectionItems);
        setError(
          `Failed to edit item in ${collectionType}. Please try again.`
        );
      }
    },
    [onEditItem, selectedCollection, collectionItems, collectionType]
  );


  // Handle removing items from the collection (supports both single and batch operations)
  const handleRemoveItems = useCallback(
    async (itemIds: number | number[]) => {
      console.log("onRemoveItems", !!onRemoveItems);
      console.log("selectedCollection", !!selectedCollection);
      if (!onRemoveItems || !selectedCollection) return;

      console.log("Removing items:", itemIds);

      // Convert single ID to array if needed
      const idsArray = Array.isArray(itemIds) ? itemIds : [itemIds];
      if (idsArray.length === 0) return;

      // Find the items to be removed
      const itemsToRemove = collectionItems.filter((item) =>
        idsArray.includes(item.id)
      );
      if (itemsToRemove.length === 0) return;

      // Get the positions of the removed items for shifting remaining items
      const removedPositions = itemsToRemove
        .map((item) => item.position || 0)
        .filter((pos) => pos > 0)
        .sort((a, b) => a - b);

      // Create updated collection with removed items filtered out
      const remainingItems = collectionItems.filter(
        (item) => !idsArray.includes(item.id)
      );

      // Adjust positions of remaining items
      // For each removed position, decrement the position of items that were after it
      removedPositions.forEach((removedPos, idx) => {
        // Adjust for positions already removed
        const adjustedPos = removedPos - idx;

        // Decrement position of all items that were after this one
        for (let i = 0; i < remainingItems.length; i++) {
          if ((remainingItems[i].position ?? 0) > adjustedPos) {
            remainingItems[i].position = (remainingItems[i].position ?? 0) - 1;
          }
        }
      });

      // Update state with the adjusted remaining items
      setCollectionItems(remainingItems);

      try {
        // Make the API call
        await onRemoveItems(selectedCollection.id, idsArray);
      } catch (err) {
        console.error("Error removing items from collection:", err);

        // Restore the original items on error
        setCollectionItems(collectionItems);
        setError(
          `Failed to remove items from ${collectionType}. Please try again.`
        );
      }
    },
    [onRemoveItems, selectedCollection, collectionItems, collectionType]
  );

  // Handle updating item positions (supports both single item and range updates)
  const handleUpdateItemPositions = useCallback(
    async (
      itemId: number,
      targetPosition: number,
      sourceStartPosition?: number,
      sourceEndPosition?: number
    ) => {
      if (!selectedCollection || !onUpdateItemPosition) return;

      // Make a copy of the current items
      const updatedItems = [...collectionItems];

      // Determine if this is a single item update or a range update
      let itemsToMove: AudioItem[];
      let startPos: number;
      let endPos: number;
      if (
        sourceStartPosition !== undefined &&
        sourceEndPosition !== undefined
      ) {
        // RANGE UPDATE - validate range
        if (sourceStartPosition > sourceEndPosition) return;

        // Get items in the range
        itemsToMove = updatedItems.filter((item) => {
          const pos = item.position;
          return (
            pos !== undefined &&
            pos >= sourceStartPosition &&
            pos <= sourceEndPosition
          );
        });

        startPos = sourceStartPosition;
        endPos = sourceEndPosition;
      } else {
        // SINGLE ITEM UPDATE - find the item and its position
        const itemToMove = updatedItems.find((item) => item.id === itemId);
        if (!itemToMove) return;

        const currentPosition = itemToMove.position || 0;
        itemsToMove = [itemToMove];
        startPos = currentPosition;
        endPos = currentPosition;
      }

      // Early return if no items to move or moving to same position
      if (itemsToMove.length === 0 || targetPosition === startPos) return;

      // Number of items being moved
      const itemCount = itemsToMove.length;
      let adjustedNewPosition = targetPosition;

      // Adjust positions of other items based on direction of movement
      if (targetPosition > endPos) {
        // Moving down - shift items between end position and target position up
        for (const item of updatedItems) {
          const pos = item.position;
          if (
            pos !== undefined &&
            endPos < pos &&
            pos < targetPosition &&
            !itemsToMove.includes(item)
          ) {
            item.position = pos - itemCount;
          }
        }
        // When moving down, we need to adjust the target position
        // since some positions have been shifted up
        adjustedNewPosition = targetPosition - itemCount;
      } else {
        // Moving up - shift items between target position and start position down
        for (const item of updatedItems) {
          const pos = item.position;
          if (
            pos !== undefined &&
            targetPosition <= pos &&
            pos < startPos &&
            !itemsToMove.includes(item)
          ) {
            item.position = pos + itemCount;
          }
        }
      }

      // Place moved items in their new positions
      itemsToMove.forEach((item, index) => {
        item.position = adjustedNewPosition + index;
      });

      // Sort by position
      updatedItems.sort((a, b) => (a.position || 0) - (b.position || 0));

      // Optimistically update the state
      setCollectionItems(updatedItems);

      try {
        // Make the API call to persist the changes
        await onUpdateItemPosition(
          selectedCollection.id,
          itemId,
          targetPosition,
          sourceStartPosition,
          sourceEndPosition
        );
      } catch (err) {
        console.error("Error updating item positions:", err);
        // Revert to previous state on error
        setCollectionItems(collectionItems);
        setError(
          `Failed to update positions in ${collectionType}. Please try again.`
        );
      }
    },
    [onUpdateItemPosition, selectedCollection, collectionItems, collectionType]
  );

  // Return to the collections grid view
  const handleBackToCollections = useCallback(() => {
    setSelectedCollection(null);
    setCollectionItems([]);
    setViewMode("grid");
  }, []);

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
    handleAddItems,
    handleEditItem,
    handleRemoveItems,
    handleBackToCollections,
    handleUpdateItemPositions,
  };
};
