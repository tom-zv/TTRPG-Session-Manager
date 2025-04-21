import { useQueryClient, useMutation } from "@tanstack/react-query";
import { collectionKeys, getApiForType } from "./useCollectionQueries.js";
import { CollectionType } from "../../types/AudioItem.js";

// Update a collections file volume
export const useUpdateFileVolume = (type: CollectionType) => {
  const api = getApiForType(type);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collectionId,
      fileId,
      volume,
    }: {
      collectionId: number;
      fileId: number;
      volume: number;
    }) => {
      return await api.updateFile(collectionId, fileId, { volume });
    },
    onSuccess: (_data, { collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });
    },
  });
};

export const useUpdateFile = (type: CollectionType) => {
  const api = getApiForType(type);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collectionId,
      fileId,
      params,
    }: {
      collectionId: number;
      fileId: number;
      params: { name: string; path: string; url: string };
    }) => {
      return await api.updateFile(collectionId, fileId, params);
    },
    onSuccess: (_data, { collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.collection(type, collectionId),
      });
    },
  });
};
