import { useQueryClient, useMutation } from "@tanstack/react-query";
import { collectionKeys } from "./useCollectionQueries.js";
import { macroApi } from "./collectionApi.js"; 
import { AudioMacro } from "../../types/AudioItem.js";

// Mutation hook for updating macro volume
export const useUpdateMacroVolume = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      macroId,
      volume,
    }: {
      macroId: number;
      volume: number;
    }) => {
      return await macroApi.updateCollection(macroId, undefined, undefined, volume);
    },
    onMutate: async ({ macroId, volume }) => {
      // Optimistically update the cache
      await queryClient.cancelQueries({ queryKey: collectionKeys.collection('macro', macroId) });
      await queryClient.cancelQueries({ queryKey: collectionKeys.type('macro') });

      const previousMacro = queryClient.getQueryData<AudioMacro>(collectionKeys.collection('macro', macroId));
      const previousMacroList = queryClient.getQueryData<AudioMacro[]>(collectionKeys.type('macro'));

      if (previousMacro) {
        queryClient.setQueryData<AudioMacro>(
          collectionKeys.collection('macro', macroId),
          { ...previousMacro, volume }
        );
      }
      if (previousMacroList) {
        queryClient.setQueryData<AudioMacro[]>(
          collectionKeys.type('macro'),
          previousMacroList.map(macro =>
            macro.id === macroId ? { ...macro, volume } : macro
          )
        );
      }

      return { previousMacro, previousMacroList };
    },
    onError: (_err, { macroId }, context) => {
      if (context?.previousMacro) {
        queryClient.setQueryData(collectionKeys.collection('macro', macroId), context.previousMacro);
      }
      if (context?.previousMacroList) {
        queryClient.setQueryData(collectionKeys.type('macro'), context.previousMacroList);
      }
    },
    onSettled: (_data, _error, { macroId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.collection('macro', macroId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.type('macro') });
    },
  });
};


