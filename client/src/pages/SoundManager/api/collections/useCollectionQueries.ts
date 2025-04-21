import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  playlistApi,
  sfxApi,
  ambienceApi,
  macroApi,
  CollectionType,
  CollectionApi,
} from "./collectionApi.js";
import { AudioCollection, AudioItem } from "../../types/AudioItem.js";

/* useCollectionQueries.ts
 * hook utilising React Query to handle fetching, caching, syncing and updating Audio data from the server DB.
 ****************************************************************************************************************/

// Add a new type for parent collection information
type ParentCollectionInfo = {
  type: CollectionType;
  id: number;
};

export const getApiForType = (type: CollectionType): CollectionApi => {
  switch (type) {
    case "playlist":
      return playlistApi;
    case "sfx":
      return sfxApi;
    case "ambience":
      return ambienceApi;
    case "macro":
      return macroApi;
    default:
      throw new Error(`Unsupported collection type: ${type}`);
  }
};

/* Query keys, organized in a hierarchical structure,
 *
 *     all                 specific type               specific collection                specific collection items
 * ['collections'] --> ['collections', 'type'] --> ['collections', 'type', 'id'] --> ['collections', 'type', 'id', 'items']
 */
export const collectionKeys = {
  all: ["collections"] as const,
  type: (type: CollectionType) => [...collectionKeys.all, type] as const,
  collection: (type: CollectionType, id: number) =>
    [...collectionKeys.type(type), id] as const,
};

// Fetch all collections of a specific type
export const useGetCollectionsOfType = (type: CollectionType, options = {}) => {
  const api = getApiForType(type);

  return useQuery({
    queryKey: collectionKeys.type(type),
    queryFn: async () => {
      const collections = await api.getAllCollections();

      // Transform the array of collections into a virtual collection object
      return {
        id: -1,
        type: type,
        name: `All ${type}s`,
        items: collections,
      } as AudioCollection;
    },
    ...options,
  });
};

// Fetch all items in a specific collection
export const useGetCollectionById = (
  type: CollectionType,
  id: number,
  options = {}
) => {
  const api = getApiForType(type);

  return useQuery({
    queryKey: collectionKeys.collection(type, id),
    queryFn: () => api.getCollectionById(id, true),
    enabled: id > 0,
    ...options,
  });
};

// Create a new collection
export const useCreateCollection = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);

  return useMutation({
    mutationFn: ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }) => api.createCollection(name, description),
    onMutate: async (newCollection) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: collectionKeys.type(type) });
      // Save previous value
      const previousCollections = queryClient.getQueryData(
        collectionKeys.type(type)
      );
      // Optimistic update
      queryClient.setQueryData(collectionKeys.type(type), (old: any) => {
        // If old is undefined, initialize with a new virtual collection
        if (!old) {
          return {
            id: -1,
            type: type,
            name: `All ${type}s`,
            items: [newCollection],
          };
        }

        // If old is already a virtual collection (with items array)
        if (old.items) {
          return {
            ...old,
            items: [...old.items, newCollection],
          };
        }

        // If old is an array (unlikely but for safety)
        if (Array.isArray(old)) {
          return [...old, newCollection];
        }

        // Default fallback
        return old;
      });
      // return saved value in context object
      return { previousCollections };
    },
    onError: (_err, _newCollection, context) => {
      queryClient.setQueryData(
        collectionKeys.type(type),
        context!.previousCollections
      );
    },
    onSettled: () => {
      // Invalidate the collections list query to refetch
      queryClient.invalidateQueries({ queryKey: collectionKeys.type(type) });
    },
  });
};

// Delete a collection
export const useDeleteCollections = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);

  return useMutation({
    mutationFn: async ({ ids }: { ids: number[] }) => {
      const deletePromises = ids.map((id) => api.deleteCollection(id));
      return Promise.all(deletePromises);
    },
    onMutate: async ({ ids }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: collectionKeys.type(type) });
      // Save previous value
      const previousCollections = queryClient.getQueryData(
        collectionKeys.type(type)
      );
      // Optimistic update - remove collections with matching ids
      queryClient.setQueryData(collectionKeys.type(type), (old: any) => {
        if (!old) return [];

        // If old is a virtual collection with items array
        if (old.items) {
          return {
            ...old,
            items: old.items.filter(
              (collection: any) => !ids.includes(collection.id)
            ),
          };
        }

        // If old is an array of collections directly
        if (Array.isArray(old)) {
          return old.filter((collection) => !ids.includes(collection.id));
        }

        // Default fallback - return old unchanged if we can't determine structure
        return old;
      });
      // return saved value in context object
      return { previousCollections };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(
        collectionKeys.type(type),
        context!.previousCollections
      );
    },
    onSettled: () => {
      // Invalidate the collections list query to refetch
      queryClient.invalidateQueries({ queryKey: collectionKeys.type(type) });
    },
  });
};

// Add items to a collection
export const useAddToCollection = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);

  return useMutation({
    mutationFn: async (vars: {
      collectionId: number;
      items: AudioItem[];
      parentInfo?: ParentCollectionInfo; // todo: make not optional
      position?: number;
      
    }) => {
      const { collectionId, items, position } = vars;
      return await api.addToCollection(collectionId, items, position);
    },
    onMutate: async ({ collectionId, items, position }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });

      const previousCollection = queryClient.getQueryData(
        collectionKeys.collection(type, collectionId)
      );

      // Optimistic update with full audio items and smart positioning
      queryClient.setQueryData(
        collectionKeys.collection(type, collectionId),
        (old: AudioCollection) => {
          if (!old) return { id: collectionId, type, name: "", items: [] };

          // Create a copy of existing items
          const updatedItems = [...(old.items || [])];

          // Filter out new items that already exist in the collection
          const newItems = items.filter(
            (newItem) =>
              !updatedItems.some((existing) => existing.id === newItem.id)
          );

          if (newItems.length === 0) return old;

          // Determine insertion position
          const insertPosition =
            position !== undefined ? position : updatedItems.length;

          // Adjust positions of existing items
          for (let i = 0; i < updatedItems.length; i++) {
            if ((updatedItems[i].position ?? 0) >= insertPosition) {
              updatedItems[i].position =
                (updatedItems[i].position ?? 0) + newItems.length;
            }
          }

          // Add new items with proper positions
          const itemsToInsert = newItems.map((item, index) => ({
            ...item,
            position: insertPosition + index,
          }));

          // Combine and sort by position
          const sortedItems = [...updatedItems, ...itemsToInsert].sort(
            (a, b) => (a.position || 0) - (b.position || 0)
          );

          return {
            ...old,
            items: sortedItems,
          };
        }
      );

      return { previousCollection };
    },
    onError: (_err, vars, context) => {
      console.log(`[AddToCollection] Error occurred, rolling back changes`);
      queryClient.setQueryData(
        collectionKeys.collection(type, vars.collectionId),
        context?.previousCollection
      );
    },
    onSettled: (_data, err, vars) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, vars.collectionId),
      });

      // Invalidate parent collection if specified - for parent pack, or parent sfx collection for macros
      if (vars.parentInfo) {
        const parentQueryKey = collectionKeys.collection(
          vars.parentInfo.type,
          vars.parentInfo.id
        );

        queryClient.invalidateQueries({
          queryKey: parentQueryKey,
        });
      }
      if (err) {
        console.error(`[AddToCollection] Error during mutation:`, err);
      }
    },
  });
};

export const useRemoveFromCollection = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);

  return useMutation({
    mutationFn: async (vars: {
      collectionId: number;
      items: AudioItem[];
      parentInfo?: ParentCollectionInfo;
    }) => {
      const { collectionId, items } = vars;
      return await api.removeFilesFromCollection(collectionId, items);
    },
    onMutate: async ({ collectionId, items }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });

      // Save previous value
      const previousCollection = queryClient.getQueryData(
        collectionKeys.collection(type, collectionId)
      );

      // Create a Set of IDs for efficient lookup
      const itemIdsToRemove = new Set(items.map((item) => item.id));

      // Optimistic update with position adjustment
      queryClient.setQueryData(
        collectionKeys.collection(type, collectionId),
        (old: AudioCollection | undefined): AudioCollection | undefined => {
          if (!old || !old.items) return old;

          // Find items being removed using the Set of IDs
          const itemsToRemove = old.items.filter((item) =>
            itemIdsToRemove.has(item.id)
          );

          // Get positions of removed items for shifting remaining items
          const removedPositions = itemsToRemove
            .map((item) => item.position ?? 0) // Use nullish coalescing for safety
            .sort((a, b) => a - b); // Sort positions numerically

          // Filter out removed items using the Set of IDs
          const remainingItems = old.items.filter(
            (item) => !itemIdsToRemove.has(item.id)
          );

          // Adjust positions of remaining items
          // Create a mutable copy for position updates
          const updatedRemainingItems = remainingItems.map((item) => ({
            ...item,
          }));

          // Store how many items have been removed *before* a given position
          const removedCountBefore: { [key: number]: number } = {};
          let count = 0;
          for (
            let i = 0;
            i <= updatedRemainingItems.length + removedPositions.length;
            i++
          ) {
            if (removedPositions.includes(i)) {
              count++;
            }
            removedCountBefore[i] = count;
          }

          // Adjust positions based on how many items were removed before them
          updatedRemainingItems.forEach((item) => {
            const originalPos = item.position ?? 0;
            const removedBefore = removedCountBefore[originalPos] ?? 0;
            if (removedBefore > 0) {
              item.position = originalPos - removedBefore;
            }
          });

          // Sort by the newly adjusted position
          updatedRemainingItems.sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0)
          );

          return {
            ...old,
            items: updatedRemainingItems, // Use the updated items
          };
        }
      );

      return { previousCollection };
    },
    onError: (_err, vars, context) => {
      // Restore previous state
      queryClient.setQueryData(
        collectionKeys.collection(type, vars.collectionId),
        context?.previousCollection
      );
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, vars.collectionId),
      });

      // Invalidate parent collection if specified
      if (vars.parentInfo) {
        const parentQueryKey = collectionKeys.collection(
          vars.parentInfo.type,
          vars.parentInfo.id
        );
        queryClient.invalidateQueries({
          queryKey: parentQueryKey,
        });
      }
    },
  });
};

// Update item positions in a collection
export const useUpdateItemPositions = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);

  return useMutation({
    mutationFn: async ({
      collectionId,
      itemId,
      targetPosition,
      sourceStartPosition,
      sourceEndPosition,
    }: {
      collectionId: number;
      itemId: number;
      targetPosition: number;
      sourceStartPosition?: number;
      sourceEndPosition?: number;
    }) => {
      return await api.updatePosition(
        collectionId,
        itemId,
        targetPosition,
        sourceStartPosition,
        sourceEndPosition
      );
    },
    onMutate: async ({
      collectionId,
      itemId,
      targetPosition,
      sourceStartPosition,
      sourceEndPosition,
    }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });

      // Save previous value
      const previousCollection = queryClient.getQueryData(
        collectionKeys.collection(type, collectionId)
      );

      // Optimistic update with position adjustments
      queryClient.setQueryData(
        collectionKeys.collection(type, collectionId),
        (old: AudioCollection) => {
          if (!old || !old.items) return old;

          // Make a copy of the current items
          const updatedItems = [...old.items];

          // Determine if this is a single item update or a range update
          let itemsToMove: AudioItem[];
          let startPos: number;
          let endPos: number;

          if (
            sourceStartPosition !== undefined &&
            sourceEndPosition !== undefined
          ) {
            // RANGE UPDATE - validate range
            if (sourceStartPosition > sourceEndPosition) return old;

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
            if (!itemToMove) return old;

            const currentPosition = itemToMove.position || 0;
            itemsToMove = [itemToMove];
            startPos = currentPosition;
            endPos = currentPosition;
          }

          // Early return if no items to move or moving to same position
          if (itemsToMove.length === 0 || targetPosition === startPos)
            return old;

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

          return {
            ...old,
            items: updatedItems,
          };
        }
      );

      return { previousCollection };
    },
    onError: (_err, vars, context) => {
      // Restore previous state
      queryClient.setQueryData(
        collectionKeys.collection(type, vars.collectionId),
        context?.previousCollection
      );
    },
    onSettled: (_data, _err, vars) => {
      // Invalidate with correct key
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, vars.collectionId),
      });
    },
  });
};
