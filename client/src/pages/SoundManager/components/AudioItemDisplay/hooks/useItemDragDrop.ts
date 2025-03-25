// src/pages/SoundManager/components/AudioItemDisplay/hooks/useItemDragDrop.ts
import { useRef, useState, useCallback, useEffect } from "react";
import { useDragSource } from "src/hooks/useDragSource.js";
import { useDropTarget } from "src/hooks/useDropTarget.js";
import { useDropTargetContext } from "src/hooks/useDropTargetContext.js";
import { AudioItem, AudioItemActions } from "../types.js";
import { DropContext } from 'src/utils/dragDropUtils.js';
import { DragDropProps } from "src/types/dragDropProps.js";

interface UseItemDragDropProps extends AudioItemActions, DragDropProps {
  items: AudioItem[];
  selectedItemIds: number[];
  contentType: string;
  containerRef?: React.RefObject<HTMLElement>; // Add this parameter
}

export function useItemDragDrop({
  items,
  selectedItemIds = [],
  contentType,
  isDragSource = false,
  isReordering = false,
  isDropTarget = false,
  dropZoneId = null,
  acceptedDropTypes = [],
  containerRef,
  onAddItems,
  onUpdateItemPosition,
  calculateDropTarget
}: UseItemDragDropProps) {
  const [targetIndex, setTargetIndex] = useState<number | undefined>(undefined);
  containerRef = containerRef || useRef<HTMLDivElement | null>(null);
  
  const {
    registerDropHandler,
    unregisterDropHandler,
    setDropZoneActiveStatus,
    acceptedTypes,
  } = useDropTargetContext();

  const calculateDropIndex = (e: React.DragEvent) => {
    if (!calculateDropTarget) return undefined;
    const index = calculateDropTarget(e, containerRef.current);
    if (index !== undefined) {
      setTargetIndex(index);
    }

    console.log("Drop index calculated:", index);

    return index;
  };
  
  const itemDragSource = isDragSource
    ? useDragSource<AudioItem>({
        contentType: contentType,
        mode: isReordering ? "reorder" : "file-transfer",
        getItemsForDrag: (selectedItemIds) => {
          return items.filter((item) => selectedItemIds.includes(item.id));
        },

        getItemId: (item) => item.id,
        getItemName: (item) => item.name,
        onDragStart: () => {
          if (
            dropZoneId &&
            items.length > 0 &&
            acceptedTypes(dropZoneId).includes(contentType)
          ) {
            setDropZoneActiveStatus(dropZoneId, true);
          }
        },
        onDragEnd: () => {
          if (dropZoneId) {
            setDropZoneActiveStatus(dropZoneId, false);
          }
          setTargetIndex(undefined);
        },
      })
    : null;

  // Handle drag start event - extracted from GridView/ListView
  const handleDragStart = useCallback(
    (e: React.DragEvent, item: AudioItem) => {
      if (item.isCreateButton || !isDragSource || !itemDragSource) return;
      
      e.stopPropagation();
      
      // If the item isn't in the selection, drag just this item
      // Otherwise drag all selected items
      const itemsToUse = selectedItemIds.includes(item.id) 
        ? selectedItemIds 
        : [item.id];
        
      itemDragSource.handleDragStart(e, item, itemsToUse);
    },
    [isDragSource, itemDragSource, selectedItemIds]
  );

  // Handle drag end event - extracted from GridView/ListView
  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      
      if (isDragSource && itemDragSource) {
        itemDragSource.handleDragEnd(e);
      }
    },
    [isDragSource, itemDragSource]
  );

  const handleDrop = useCallback(
    async (items: AudioItem[], context: DropContext<unknown>) => {
      if (onAddItems) {
        onAddItems(items, context.index);
      }
      setTargetIndex(undefined); // Clear target index after drop
    },
    [onAddItems]
  );
  
  let dropAreaProps = {};
  if (isDropTarget) {   // Local drop target
    const { dropAreaProps: dap } = useDropTarget<AudioItem>({
      acceptedTypes: ["file"],
      onItemsDropped: async (items, context) => {
        const { index, mode } = context;

        // Handle reordering
        if (mode === "reorder" && onUpdateItemPosition && items.length > 0) {
          const sourceStartPosition = items[0].position;
          const sourceEndPosition = items[items.length - 1].position;

          // Check if the drop index is within the source range
          if ( sourceStartPosition! <= index! && index! <= sourceEndPosition! + 1
          ) {
            setTargetIndex(undefined);
            return;
          }

          if (items.length > 1) {
            // For multiple items, include source positions
            await onUpdateItemPosition(
              items[0].id,
              index!,
              sourceStartPosition,
              sourceEndPosition
            );
          } else {
            // Single file reordering
            await onUpdateItemPosition(items[0].id, index!);
          }
        } else if (mode === "file-transfer" && onAddItems) {
          // Handle file transfer
          if (items.length > 0) {
            onAddItems(items, index);
          }
          setTargetIndex(undefined);
        }
      },
      calculateDropIndex,
    });
    dropAreaProps = dap;
  }

  useEffect(() => {  // Distant drop target in dropZone
    if (isDropTarget && dropZoneId) {
      registerDropHandler(dropZoneId, acceptedDropTypes, handleDrop, {
        calculateDropIndex: calculateDropIndex,
      });

      return () => {
        unregisterDropHandler(dropZoneId);
      };
    }
  }, [isDropTarget, dropZoneId, acceptedDropTypes]);

  // Return necessary handlers and state
  return {
    targetIndex,
    handleDragStart,
    handleDragEnd,
    isInsertionPoint: (index: number) => targetIndex === index,
    dropAreaProps,
    
    // Rename to dragItemProps for consistency with dropAreaProps
    dragItemProps: (item: AudioItem, className = '') => ({
      className: `${className} ${selectedItemIds.includes(item.id) ? 'selected' : ''}`,
      draggable: !item.isCreateButton && isDragSource,
      onDragStart: (e: React.DragEvent) => handleDragStart(e, item),
      onDragEnd: handleDragEnd,
    })
  };
}
