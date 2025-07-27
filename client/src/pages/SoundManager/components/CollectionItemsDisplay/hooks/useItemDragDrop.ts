// src/pages/SoundManager/components/CollectionItemsDisplay/hooks/useItemDragDrop.ts
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useDragSource } from "src/hooks/useDragSource.js";
import { useDropTarget } from "src/hooks/useDropTarget.js";
import { useDropTargetContext } from "src/hooks/useDropTargetContext.js";
import { AudioItem } from "../types.js";
import { DropContext } from 'src/utils/dragDropUtils.js';
import { DragDropProps } from "src/types/dragDropProps.js";

interface UseItemDragDropProps extends DragDropProps {
  items: AudioItem[];
  selectedItemIds: number[];
  contentType: string;
  containerRef?: React.RefObject<HTMLElement>;
  addItems?: (items: AudioItem[], position?: number, isMacro?: boolean) => void;
  updateItemPosition?: (itemId: number, targetPosition: number, sourceStartPosition?: number, sourceEndPosition?: number) => void;
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
  addItems, 
  updateItemPosition, 
  calculateDropTarget,
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
    if (index !== undefined && index !== targetIndex) {
      setTargetIndex(index);
      
    }
    return index;
  }, [targetIndex, calculateDropTarget, effectiveRef]);

  const dragSourceResult = useDragSource<AudioItem>({
    contentType: contentType,
    mode: isReorderable ? "reorder" : "file-transfer",
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
      
      // If clicked item is selected, drag all selected items; otherwise drag just this item
      const isItemSelected = selectedItemIds.includes(item.id);
      const itemsToDrag = isItemSelected
        ? items.filter(item => selectedItemIds.includes(item.id))
        : [item];
        
      itemDragSource.handleDragStart(e, itemsToDrag);
    },
    [isDragSource, itemDragSource, items, selectedItemIds]
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

  const handleDrop = useCallback(
    async (items: AudioItem[], context: DropContext<unknown>) => {
      if (addItems) { // Changed from useAddItems
        addItems(items, context.index, context.isMacro);
      }
    },
    [addItems]
  );

  const dropTargetResult = useDropTarget<AudioItem>({
    acceptedTypes: ["file","macro"],  // todo accept folder
    onItemsDropped: async (items, context) => {
      if (!isDropTarget) return;
      
      const { index, mode } = context;

      if (mode === "reorder" && updateItemPosition && items.length > 0) { 
        const sourceStartPosition = items[0].position;
        const sourceEndPosition = items[items.length - 1].position;

        if (sourceStartPosition! <= index! && index! <= sourceEndPosition! + 1) {
          setTargetIndex(undefined);
          return;
        }

        if (items.length > 1) {
          updateItemPosition( 
            items[0].id,
            index!,
            sourceStartPosition,
            sourceEndPosition
          );
        } else {
          updateItemPosition(
            items[0].id,
            index!
          );
        }
      } else if (mode === "file-transfer" && addItems) { 
        if (items.length > 0) {
          addItems(items, index); 
        }
        setTargetIndex(undefined);
      }
    },
    calculateDropIndex,
  });

  const dropAreaProps = isDropTarget ? dropTargetResult.dropAreaProps : {};

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
