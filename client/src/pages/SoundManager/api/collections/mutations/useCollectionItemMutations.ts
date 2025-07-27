import { useQueryClient, useMutation } from "@tanstack/react-query";
import { AudioCollection, AudioItem } from "../../../types/AudioItem.js";
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

      // Get current collection to filter out existing items
      const currentCollection = queryClient.getQueryData(
        collectionKeys.collection(type, collectionId)
      ) as AudioCollection | undefined;

      // Filter out items that already exist in the collection
      const newItems = items.filter(
        (newItem) =>
          !currentCollection?.items?.some(
            (existing) => existing.id === newItem.id
          )
      );

      // If no new items to add, return early without making API call
      if (newItems.length === 0) {
        return true;
      }

      // Only send items that don't already exist to the API
      return await api.addToCollection(collectionId, newItems, position);
    },
  
    onError: () => {
      console.log(`[AddToCollection] Error occurred`);
    },
    onSettled: (_data, err) => {
      // Invalidate the collection query to refetch updated data
      queryClient.invalidateQueries( {queryKey: collectionKeys.type(type)})

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
      const { collectionId, id: fileId, active, volume, delay, name, path, url } = vars;

      const results: boolean[] = [];
      
      // collection params update
      if (active !== undefined || volume !== undefined || delay !== undefined) {
        const collectionResult = await api.updateFile(collectionId, fileId, {  
          active,
          volume,
          delay,
        });
        results.push(collectionResult);
      }

      // file params update
      if (name !== undefined || path !== undefined || url !== undefined) {
        const fileResult = await updateAudioFile(fileId, {
          name,
          path,
          url,
        });
        results.push(!!fileResult);
      }

      return results.every(Boolean);
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.type(type),
      });
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
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.type(type),
      });
    },
  });
};

// Update a collections file volume
export const useUpdateFileVolume = (type: CollectionType) => {
  const api = getApiForType(type);
  const queryClient = useQueryClient();

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
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.type(type),
      });
    },
  });
};
