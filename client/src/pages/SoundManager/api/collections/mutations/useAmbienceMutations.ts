import { useQueryClient, useMutation } from "@tanstack/react-query";
import { collectionKeys } from "../useCollectionQueries.js";
import { ambienceApi } from "../collectionApi.js";
import { AudioCollection } from "../../../types/AudioItem.js";

// Define a context type to reuse
type MutationContext = {
  previousCollections?: AudioCollection<AudioCollection>;
};

export const useActivateAmbienceFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collectionId,
      fileId,
    }: {
      collectionId: number;
      fileId: number;
    }) => {
      return await ambienceApi.updateFile(collectionId, fileId, {
        active: true,
      });
    },

    onMutate: async ({ collectionId, fileId }) => {
      await queryClient.cancelQueries({
        queryKey: collectionKeys.type("ambience"),
      });

      const previousCollections = queryClient.getQueryData<AudioCollection<AudioCollection>>(
          collectionKeys.type("ambience")
        );

      
      if (previousCollections) { 
        queryClient.setQueryData(
          collectionKeys.type("ambience"),
          {
          ...previousCollections,
          items: previousCollections.items?.map((collection) =>
          collection.id === collectionId
            ? {
                ...collection,
                items: collection.items?.map((item) =>
                  item.id === fileId ? { ...item, active: true } : item
                ),
              }
            : collection
        )}
        );
      }

      return { previousCollections };
    },

    onError: (context?: MutationContext) => {
      if (context?.previousCollections) {
        queryClient.setQueryData(
          collectionKeys.type("ambience"),
          context.previousCollections
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.type("ambience"),
      });
    },
  });
};

export const useDeactivateAmbienceFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collectionId,
      fileId,
    }: {
      collectionId: number;
      fileId: number;
    }) => {
      return await ambienceApi.updateFile(collectionId, fileId, {
        active: false,
      });
    },

    onMutate: async ({ collectionId, fileId }) => {
      await queryClient.cancelQueries({
        queryKey: collectionKeys.type("ambience"),
      });

      const previousCollections = queryClient.getQueryData<AudioCollection<AudioCollection>>(
        collectionKeys.type("ambience")
      );

      if (previousCollections) { 
        queryClient.setQueryData(
          collectionKeys.type("ambience"),
          {
          ...previousCollections,
          items: previousCollections.items?.map((collection) =>
          collection.id === collectionId
            ? {
                ...collection,
                items: collection.items?.map((item) =>
                  item.id === fileId ? { ...item, active: true } : item
                ),
              }
            : collection
        )}
        );
      }

      return { previousCollections };
    },

    onError: (context?: MutationContext) => {
      if (context?.previousCollections) {
        queryClient.setQueryData(
          collectionKeys.type("ambience"),
          context.previousCollections
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.type("ambience"),
      });
    },
  });
};
