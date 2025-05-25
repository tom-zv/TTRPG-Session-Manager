import { useQueryClient, useMutation } from "@tanstack/react-query";
import { CollectionType } from "../collectionApi.js";
import { AudioCollection } from "../../../types/AudioItem.js";
import { getApiForType, collectionKeys } from "../useCollectionQueries.js";

/* useCollectionBaseMutations.ts
 * Mutation hooks for basic CRUD operations on collections using React Query
 ****************************************************************************************************************/

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
      queryClient.setQueryData(collectionKeys.type(type), (old: AudioCollection) => {
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

export const useUpdateCollection = (type: CollectionType) => {
  const queryClient = useQueryClient();
  const api = getApiForType(type);
  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
    }: {
      id: number;
      name?: string;
      description?: string;
    }) => {
      return await api.updateCollection(id, name, description);
    },
    onMutate: async ({ id, name, description }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection(type, id),
      });
      // Save previous value
      const previousCollection = queryClient.getQueryData(
        collectionKeys.collection(type, id)
      );
      // Optimistic update
      queryClient.setQueryData(
        collectionKeys.collection(type, id),
        (old: AudioCollection) => {
          if (!old) return { id, type, name, description, items: [] };
          return {
            ...old,
            name: name,
            description: description,
          };
        }
      );
      // return saved value in context object
      return { previousCollection };
    },
    onError: (_err, _vars, context) => {
      const previousCollection = (context as { previousCollection: AudioCollection }).previousCollection;
      queryClient.setQueryData(
        collectionKeys.collection(type, previousCollection.id),
        previousCollection
      );
    },
    onSettled: (_data, _err, { id }) => {
      // Invalidate the collection query to refetch
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, id),
      });
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
      queryClient.setQueryData(collectionKeys.type(type), (old: AudioCollection) => {
        if (!old) return [];

        // If old is a virtual collection with items array
        if (old.items) {
          return {
            ...old,
            items: old.items.filter(
              (collection) => !ids.includes(collection.id)
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