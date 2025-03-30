import React, { useRef } from 'react';
import { AudioItem, AudioItemActions } from '../index.js';
import AudioItemCard from './AudioItemCard/AudioItemCard.js';
import { DragDropProps } from 'src/types/dragDropProps.js';
import { useItemDragDrop } from '../hooks/useItemDragDrop.js';
import { calculateCardDropTarget } from 'src/utils/gridDropUtils.js';
import './GridView.css';

interface GridViewProps extends AudioItemActions, DragDropProps {
  // Data props
  items: AudioItem[];
  itemType?: string;
  // UI state props
  showActions?: boolean | null;
  selectedItemIds?: number[];
  showPlayButton?: boolean;
  // Event handlers
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
  // Render customization
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
}

export const GridView: React.FC<GridViewProps> = ({
  // Data props
  items,
  // UI state props
  showActions = false,
  showPlayButton = false,
  selectedItemIds = [],
  // Action handlers
  onItemSelect,
  onPlayItem,
  onAddItems,
  onEditItem,
  onRemoveItems,
  // Render customization
  renderSpecialItem,
  // Drag and drop props
  isDragSource = false,
  isDropTarget = false,
  dropZoneId = null,
  acceptedDropTypes = [],
}) => {
  const gridRef = useRef<HTMLDivElement>(null) as React.MutableRefObject<HTMLDivElement | null>;

  const { 
    targetIndex: cardTargetIndex, 
    dropAreaProps,
    dragItemProps,
  } = useItemDragDrop({
    items,
    selectedItemIds,
    contentType: 'file',
    isDragSource,
    isDropTarget,
    dropZoneId,
    acceptedDropTypes,
    containerRef: gridRef,
    onAddItems,
    calculateDropTarget: calculateCardDropTarget
  });

  const { className: dropClassName, ...restDropProps } = dropAreaProps as { className?: string, [key: string]: any };
  const combinedClassName = `audio-item-grid ${dropClassName || ''}`.trim();

  const handleItemSelect = (e: React.MouseEvent, itemId: number) => {
    if (onItemSelect) {
      onItemSelect(e, itemId);
    }
  };

  return (
    <div ref={gridRef} className={combinedClassName} {...restDropProps}>
      {items.map((item, index) => {
        const isDropTarget = cardTargetIndex === index;
        const isSelected = selectedItemIds.includes(item.id);
        const itemDragProps = dragItemProps(item);
        
        return (
          <AudioItemCard
            key={item.id}
            item={item}
            isSelected={isSelected}
            isDropTarget={isDropTarget}
            showActions={!!showActions}
            showPlayButton={!!showPlayButton}
            selectedItemIds={selectedItemIds}
            dragItemProps={itemDragProps}
            onSelect={handleItemSelect}
            onPlayItem={onPlayItem}
            onEditItem={onEditItem}
            onRemoveItems={onRemoveItems}
            renderSpecialItem={renderSpecialItem}
          />
        );
      })}
    </div>
  );
};

export default GridView;