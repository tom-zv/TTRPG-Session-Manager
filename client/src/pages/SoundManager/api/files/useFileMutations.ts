import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateAudioFile } from "./fileApi.js";
import { collectionKeys } from "../collections/useCollectionQueries.js";

export const useUpdateFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      name?: string;
      path?: string;
      url?: string;
    }) => {
      const { id, ...fileParams } = vars;
      return await updateAudioFile(id, fileParams);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: collectionKeys.all
      });
    }
  });
};