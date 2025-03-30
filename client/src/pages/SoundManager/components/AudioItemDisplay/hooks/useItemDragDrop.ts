// src/pages/SoundManager/components/AudioItemDisplay/hooks/useItemDragDrop.ts
import { useRef, useState, useCallback, useEffect, useMemo } from "react"; // Add useMemo
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
  containerRef?: React.RefObject<HTMLElement>;
}

export function useItemDragDrop({
  items,
  selectedItemIds = [],
  contentType,
  isDragSource = false,
  isReorderable = false,
  isDropTarget = false,
  dropZoneId = null,
  acceptedDropTypes = [],
  containerRef,
  onAddItems,
  onUpdateItemPosition,
  calculateDropTarget
}: UseItemDragDropProps) {
  const [targetIndex, setTargetIndex] = useState<number | undefined>(undefined);
  const internalRef = useRef<HTMLDivElement | null>(null);
  const effectiveRef = containerRef || internalRef;

  const {
    registerDropHandler,
    unregisterDropHandler,
    setDropZoneActiveStatus,
    acceptedTypes,
  } = useDropTargetContext();

  const calculateDropIndex = useCallback((e: React.DragEvent) => {
    if (!calculateDropTarget) return undefined;
    const index = calculateDropTarget(e, effectiveRef.current);
    if (index !== undefined) {
      setTargetIndex(index);
    }
    return index;
  }, [calculateDropTarget, effectiveRef]);

  const dragSourceResult = useDragSource<AudioItem>({
    contentType: contentType,
    mode: isReorderable ? "reorder" : "file-transfer",
    getItemsForDrag: (selectedItemIds) => {
      return items.filter((item) => selectedItemIds.includes(item.id));
    },
    getItemId: (item) => item.id,
    getItemName: (item) => item.name,
    onDragStart: () => {
      if (isDragSource && dropZoneId && items.length > 0 && 
          acceptedTypes(dropZoneId).includes(contentType)) {
        setDropZoneActiveStatus(dropZoneId, true);
      }
    },
    onDragEnd: () => {
      if (isDragSource && dropZoneId) {
        setDropZoneActiveStatus(dropZoneId, false);
      }
      setTargetIndex(undefined);
    },
  });

  const itemDragSource = isDragSource ? dragSourceResult : null;

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: AudioItem) => {
      if (item.isCreateButton || !isDragSource || !itemDragSource) return;
      
      e.stopPropagation();
      
      const itemsToUse = selectedItemIds.includes(item.id) 
        ? selectedItemIds 
        : [item.id];
        
      itemDragSource.handleDragStart(e, item, itemsToUse);
    },
    [isDragSource, itemDragSource, selectedItemIds]
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      
      if (isDragSource && itemDragSource) {
        itemDragSource.handleDragEnd(e);
      }
    },
    [isDragSource, itemDragSource]
  );

  // Memoize handleDrop to prevent recreation on every render
  const handleDrop = useCallback(
    async (items: AudioItem[], context: DropContext<unknown>) => {
      if (onAddItems) {
        onAddItems(items, context.index);
      }
      setTargetIndex(undefined);
    },
    [onAddItems]
  );

  const dropTargetResult = useDropTarget<AudioItem>({
    acceptedTypes: ["file","macro"],
    onItemsDropped: async (items, context) => {
      if (!isDropTarget) return;
      
      const { index, mode } = context;

      if (mode === "reorder" && onUpdateItemPosition && items.length > 0) {
        const sourceStartPosition = items[0].position;
        const sourceEndPosition = items[items.length - 1].position;

        if (sourceStartPosition! <= index! && index! <= sourceEndPosition! + 1) {
          setTargetIndex(undefined);
          return;
        }

        if (items.length > 1) {
          await onUpdateItemPosition(
            items[0].id,
            index!,
            sourceStartPosition,
            sourceEndPosition
          );
        } else {
          await onUpdateItemPosition(items[0].id, index!);
        }
      } else if (mode === "file-transfer" && onAddItems) {
        if (items.length > 0) {
          onAddItems(items, index);
        }
        setTargetIndex(undefined);
      }
    },
    calculateDropIndex,
  });

  let dropAreaProps = isDropTarget ? dropTargetResult.dropAreaProps : {};

  const registrationOptions = useMemo(() => ({
    calculateDropIndex: calculateDropIndex,
  }), [calculateDropIndex]);

  const registerHandler = useCallback(() => {
    if (isDropTarget && dropZoneId) {
      registerDropHandler(dropZoneId, acceptedDropTypes, handleDrop, registrationOptions);
    }
  }, [isDropTarget, dropZoneId, acceptedDropTypes, registerDropHandler, handleDrop, registrationOptions]);

  const unregisterHandler = useCallback(() => {
    if (isDropTarget && dropZoneId) {
      unregisterDropHandler(dropZoneId);
    }
  }, [isDropTarget, dropZoneId, unregisterDropHandler]);

  useEffect(() => {
    registerHandler();
    return unregisterHandler;
  }, [registerHandler, unregisterHandler]);

  return {
    targetIndex,
    handleDragStart,
    handleDragEnd,
    isInsertionPoint: (index: number) => targetIndex === index,
    dropAreaProps,
    dragItemProps: (item: AudioItem, className = '') => ({
      className: `${className} ${selectedItemIds.includes(item.id) ? 'selected' : ''}`,
      draggable: !item.isCreateButton && isDragSource,
      onDragStart: (e: React.DragEvent) => handleDragStart(e, item),
      onDragEnd: handleDragEnd,
    })
  };
}
