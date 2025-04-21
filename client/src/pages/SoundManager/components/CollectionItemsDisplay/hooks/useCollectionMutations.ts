import {
  useAddToCollection,
  useRemoveFromCollection,
  useUpdateItemPositions,
  useCreateCollection,
  useDeleteCollections,
} from "../../../api/collections/useCollectionQueries.js";
import { AudioItem, CollectionType } from "../types.js";

interface MutationCallbacks {
  onMutationComplete?: () => void;
  onAddSuccess?: () => void;
  onRemoveSuccess?: () => void;
  onUpdatePositionSuccess?: () => void;
}

export const useCollectionMutations = (
  collectionId: number,
  collectionType: CollectionType,
  callbacks?: MutationCallbacks,
  parentInfo?: { type: CollectionType; id: number }
) => {
  const createCollectionMutation = useCreateCollection(collectionType);
  const deleteCollectionsMutation = useDeleteCollections(collectionType);
  const addToCollectionMutation = useAddToCollection(collectionType);
  const removeFromCollectionMutation = useRemoveFromCollection(collectionType);
  const updatePositionsMutation = useUpdateItemPositions(collectionType);

  // Determine if we're in "virtual collection" mode -
  // This is for displaying all collections of a type.
  const isVirtualCollection = collectionId === -1;

  // Define mutations based on mode
  if (isVirtualCollection) {
    return {
      // Create new collection instead of adding items
      addItemsMutation: () => {
        console.warn(
          "addItemsMutation not available in virtual collection mode - use createCollection instead"
        );
      },

      // Delete collections instead of removing items
      removeItemsMutation: (items: AudioItem[]) => {
        return deleteCollectionsMutation.mutate(
          { ids: items.map((collection) => collection.id) },
          {
            onSuccess: () => callbacks?.onRemoveSuccess?.(),
            onError: (error) =>
              console.error("Error deleting collections:", error),
          }
        );
      },

      // Position updates don't make sense for collections list
      updateItemPositionsMutation: () => {
        console.warn(
          "updateItemPositionsMutation not supported in virtual collection mode"
        );
      },

      // Add function to create new collections
      createCollection: (name: string, description?: string) => {
        return createCollectionMutation.mutate(
          { name, description },
          {
            onSuccess: () => callbacks?.onAddSuccess?.(),
            onError: (error) =>
              console.error("Error creating collection:", error),
          }
        );
      },

      isVirtualCollection: true,
    };
  } else {
    // Normal collection mode - handle audio items
    return {
      addItemsMutation: (items: AudioItem[], position?: number) => {
        return addToCollectionMutation.mutate(
          {
            collectionId: collectionId!,
            items,
            position,
            parentInfo,
          },
          {
            onSuccess: () => callbacks?.onAddSuccess?.(),
            onError: (error) =>
              console.error("Error adding items to collection:", error),
          }
        );
      },

      removeItemsMutation: (items: AudioItem[]) => {
        return removeFromCollectionMutation.mutate(
          {
            collectionId: collectionId!,
            items,
            parentInfo,
          },
          {
            onSuccess: () => callbacks?.onRemoveSuccess?.(),
            onError: (error) =>
              console.error("Error removing items from collection:", error),
          }
        );
      },

      updateItemPositionsMutation: (
        itemId: number,
        targetPosition: number,
        sourceStartPosition?: number,
        sourceEndPosition?: number
      ) => {
        return updatePositionsMutation.mutate(
          {
            collectionId: collectionId!,
            itemId,
            targetPosition,
            sourceStartPosition,
            sourceEndPosition,
          },
          {
            onSuccess: () => callbacks?.onUpdatePositionSuccess?.(),
            onError: (error) =>
              console.error("Error updating item positions:", error),
          }
        );
      },
      createCollection: undefined,
      isVirtualCollection: false,
    };
  }
};
