import { useQueryClient, useMutation } from "@tanstack/react-query";
import { AudioCollection, AudioItem, isAudioFile } from "../../../types/AudioItem.js";
import { CollectionType } from "shared/audio/types.js";
import { getApiForType, collectionKeys, ParentCollectionInfo } from "../useCollectionQueries.js";
import { updateAudioFile } from "../../files/fileApi.js"; 

/* useCollectionItemMutations.ts
 * Mutation hooks for managing items within collections using React Query
 ****************************************************************************************************************/

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

/**
 * Update file in a collection context
 */
export const useUpdateCollectionFile = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);
  
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      collectionId: number;
      name?: string;
      path?: string;
      url?: string;
      active?: boolean;
      volume?: number;
      delay?: number;
      parentInfo?: ParentCollectionInfo;
    }) => {
      const { collectionId, id: fileId, ...restProps } = vars;
      const results: boolean[] = [];
        
      const collectionParams: Partial<{ active: boolean; volume: number; delay: number; }> = {};
      const fileParams: Partial<{ name: string; path: string; url: string; }> = {};
      
      if (restProps.active !== undefined) collectionParams.active = restProps.active;
      if (restProps.volume !== undefined) collectionParams.volume = restProps.volume;
      if (restProps.delay !== undefined) collectionParams.delay = restProps.delay;
      
      if (restProps.name !== undefined) fileParams.name = restProps.name;
      if (restProps.path !== undefined) fileParams.path = restProps.path;
      if (restProps.url !== undefined) fileParams.url = restProps.url;
      
      if (Object.keys(collectionParams).length > 0) {
        const collectionResult = await api.updateFile(collectionId, fileId, collectionParams);
        results.push(collectionResult);
      }
      
      if (Object.keys(fileParams).length > 0) {
        const fileResult = await updateAudioFile(fileId, fileParams);
        results.push(!!fileResult);
      }
      
      return results.every(result => result === true);
    },
    
    onMutate: async ({ collectionId, id: fileId, name, path, url, active, volume, delay }) => {
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });
      
      const previousCollection = queryClient.getQueryData(
        collectionKeys.collection(type, collectionId)
      );
      
      queryClient.setQueryData(
        collectionKeys.collection(type, collectionId),
        (old: AudioCollection | undefined): AudioCollection | undefined => {
          if (!old || !old.items) return old;
          const itemToUpdate = old.items.find((item) => item.id === fileId);
          if (!itemToUpdate || !isAudioFile(itemToUpdate)) return old;
          
          const updatedItem = { ...itemToUpdate };
          
          if (name !== undefined) updatedItem.name = name;
          if (path !== undefined) updatedItem.path = path;
          if (url !== undefined) updatedItem.url = url;
          if (active !== undefined) updatedItem.active = active;
          if (volume !== undefined) updatedItem.volume = volume;
          if (delay !== undefined) updatedItem.delay = delay;
          
          const updatedItems = old.items.map((item) =>
            item.id === fileId ? updatedItem : item
          );
          
          return {
            ...old,
            items: updatedItems,
          };
        }
      );
      return { previousCollection };
    },
    onError: (_err, vars, context) => {
      queryClient.setQueryData(
        collectionKeys.collection(type, vars.collectionId),
        context?.previousCollection
      );
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, vars.collectionId),
      });
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
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });

      const previousCollection = queryClient.getQueryData(
        collectionKeys.collection(type, collectionId)
      );

      const itemIdsToRemove = new Set(items.map((item) => item.id));

      queryClient.setQueryData(
        collectionKeys.collection(type, collectionId),
        (old: AudioCollection | undefined): AudioCollection | undefined => {
          if (!old || !old.items) return old;

          const itemsToRemove = old.items.filter((item) =>
            itemIdsToRemove.has(item.id)
          );

          const removedPositions = itemsToRemove
            .map((item) => item.position ?? 0)
            .sort((a, b) => a - b);

          const remainingItems = old.items.filter(
            (item) => !itemIdsToRemove.has(item.id)
          );

          const updatedRemainingItems = remainingItems.map((item) => ({
            ...item,
          }));

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

          updatedRemainingItems.forEach((item) => {
            const originalPos = item.position ?? 0;
            const removedBefore = removedCountBefore[originalPos] ?? 0;
            if (removedBefore > 0) {
              item.position = originalPos - removedBefore;
            }
          });

          updatedRemainingItems.sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0)
          );

          return {
            ...old,
            items: updatedRemainingItems,
          };
        }
      );

      return { previousCollection };
    },
    onError: (_err, vars, context) => {
      queryClient.setQueryData(
        collectionKeys.collection(type, vars.collectionId),
        context?.previousCollection
      );
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, vars.collectionId),
      });

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

// Update a collections file volume
export const useUpdateFileVolume = (type: CollectionType) => {
  const api = getApiForType(type);

  return useMutation({
    mutationFn: async ({
      collectionId, fileId, volume,
    }: {
      collectionId: number;
      fileId: number;
      volume: number;
    }) => {
      return await api.updateFile(collectionId, fileId, { volume });
    },
  });
};
