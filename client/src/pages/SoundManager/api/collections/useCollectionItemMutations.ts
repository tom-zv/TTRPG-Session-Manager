import { useQueryClient, useMutation } from "@tanstack/react-query";
import { CollectionType } from "./collectionApi.js";
import { AudioCollection, AudioItem, isAudioFile } from "../../types/AudioItem.js";
import { getApiForType, collectionKeys, ParentCollectionInfo } from "./useCollectionQueries.js";

/* useCollectionItemMutations.ts
 * Mutation hooks for managing items within collections using React Query
 ****************************************************************************************************************/

// Add items to a collection
export const useAddToCollection = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);

  return useMutation({
    mutationFn: async (vars: {
      collectionId: number;
      items: AudioItem[];
      parentInfo?: ParentCollectionInfo;
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

export const useUpdateFile = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);
  
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      collectionId: number;
      name?: string;
      filePath?: string;
      fileUrl?: string;
      active?: boolean;
      volume?: number;
      delay?: number;
      parentInfo?: ParentCollectionInfo;
    }) => {
      const { collectionId, id: fileId, parentInfo, ...restProps } = vars;
      
      const params: Partial<{ name: string; filePath: string; fileUrl: string; active: boolean; volume: number; delay: number; }> = {};
      
      if (restProps.name !== undefined) params.name = restProps.name;
      if (restProps.filePath !== undefined) params.filePath = restProps.filePath;
      if (restProps.fileUrl !== undefined) params.fileUrl = restProps.fileUrl;
      if (restProps.active !== undefined) params.active = restProps.active;
      if (restProps.volume !== undefined) params.volume = restProps.volume;
      if (restProps.delay !== undefined) params.delay = restProps.delay;
      
      return await api.updateFile(collectionId, fileId, params);
    },
    onMutate: async ({ collectionId, id: fileId, name, filePath, fileUrl, active, volume, delay }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });
      
      // Save previous value
      const previousCollection = queryClient.getQueryData(
        collectionKeys.collection(type, collectionId)
      );
      
      // Optimistic update
      queryClient.setQueryData(
        collectionKeys.collection(type, collectionId),
        (old: AudioCollection | undefined): AudioCollection | undefined => {
          if (!old || !old.items) return old;
          // Find the item to update
          const itemToUpdate = old.items.find((item) => item.id === fileId);
          if (!itemToUpdate || !isAudioFile(itemToUpdate)) return old;
          
          // Now TypeScript knows it's an AudioFile
          const updatedItem = { ...itemToUpdate };
          
          // Update the item with new values
          if (name !== undefined) updatedItem.name = name;
          if (filePath !== undefined) updatedItem.filePath = filePath;
          if (fileUrl !== undefined) updatedItem.fileUrl = fileUrl;
          if (active !== undefined) updatedItem.active = active;
          if (volume !== undefined) updatedItem.volume = volume;
          if (delay !== undefined) updatedItem.delay = delay;
          
          // Create a new array with the updated item
          const updatedItems = old.items.map((item) =>
            item.id === fileId ? updatedItem : item
          );
          
          // Return the updated collection
          return {
            ...old,
            items: updatedItems,
          };
        }
      );
      return { previousCollection };
    },
    // Rest of implementation remains the same
    onError: (_err, vars, context) => {
      // Restore previous state
      queryClient.setQueryData(
        collectionKeys.collection(type, vars.collectionId),
        context?.previousCollection
      );
    },
    onSettled: (_data, _err, vars) => {
      // Invalidate the collection query
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