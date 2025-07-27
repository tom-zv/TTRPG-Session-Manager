import { useQueryClient, useMutation } from "@tanstack/react-query";
import { CollectionType } from "shared/audio/types.js";
import { AudioCollection, AudioItem } from "src/pages/SoundManager/types/AudioItem.js";
import { getApiForType, collectionKeys } from "../useCollectionQueries.js";

/* useCollectionPositionMutations.ts
 * Mutation hooks for managing positions of items within collections using React Query
 ****************************************************************************************************************/

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
      
      if (sourceStartPosition !== undefined && sourceEndPosition !== undefined) {
        

        return await api.updateFileRangePosition(
          collectionId,
          sourceStartPosition,
          sourceEndPosition,
          targetPosition
        );
      } else {
        return await api.updateFilePosition(
          collectionId,
          itemId,
          targetPosition
        );
      }
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