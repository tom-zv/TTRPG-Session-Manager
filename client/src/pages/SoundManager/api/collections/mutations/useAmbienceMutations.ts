import { useQueryClient, useMutation } from "@tanstack/react-query";
import { collectionKeys } from "../useCollectionQueries.js";
import { ambienceApi } from "../collectionApi.js";
import { AudioCollection } from "../../../types/AudioItem.js";

// Define a context type to reuse
type MutationContext = {
  previousCollection?: AudioCollection;
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
      return await ambienceApi.updateFile(collectionId, fileId, { active: true });
    },

    onMutate: async ({ collectionId, fileId }) => {
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection("ambience", collectionId),
      });

      const previousCollection = queryClient.getQueryData<AudioCollection>(
        collectionKeys.collection("ambience", collectionId)
      );

      if (previousCollection) {
        queryClient.setQueryData(
          collectionKeys.collection("ambience", collectionId),
          {
            ...previousCollection,
            items: previousCollection.items?.map((item) =>
              item.id === fileId ? { ...item, active: true } : item
            ),
          }
        );
      }

      return { previousCollection };
    },

    onError: (_err, { collectionId }, context?: MutationContext) => {
      if (context?.previousCollection) {
        queryClient.setQueryData(
          collectionKeys.collection("ambience", collectionId),
          context.previousCollection
        );
      }
    },

    onSettled: (_data, _error, { collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection("ambience", collectionId),
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
      return await ambienceApi.updateFile(collectionId, fileId, { active: false });
    },

    onMutate: async ({ collectionId, fileId }) => {
      await queryClient.cancelQueries({
        queryKey: collectionKeys.collection("ambience", collectionId),
      });

      const previousCollection = queryClient.getQueryData<AudioCollection>(
        collectionKeys.collection("ambience", collectionId)
      );

      if (previousCollection) {
        queryClient.setQueryData(
          collectionKeys.collection("ambience", collectionId),
          {
            ...previousCollection,
            items: previousCollection.items?.map((item) =>
              item.id === fileId ? { ...item, active: false } : item
            ),
          }
        );
      }

      return { previousCollection };
    },

    onError: (_err, { collectionId }, context?: MutationContext) => {
      if (context?.previousCollection) {
        queryClient.setQueryData(
          collectionKeys.collection("ambience", collectionId),
          context.previousCollection
        );
      }
    },

    onSettled: (_data, _error, { collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection("ambience", collectionId),
      });
    },
  });
};

