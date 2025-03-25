import React, { useRef } from 'react';
import { AudioItem, AudioItemActions } from '../index.js';
import { getItemIcon } from '../utils/getItemIcon.js';
import ItemActions from './ItemActions.js';
import { DragDropProps } from 'src/types/dragDropProps.js';
import { useItemDragDrop } from '../hooks/useItemDragDrop.js';
import { calculateCardDropTarget } from 'src/utils/gridDropUtils.js';

interface GridViewProps extends AudioItemActions, DragDropProps {
  // Data props
  items: AudioItem[];
  itemType?: string;
  // UI state props
  showActions?: boolean | null;
  selectedItemIds?: number[];
  // Event handlers
  onItemSelect: (e: React.MouseEvent, itemId: number) => void;
  // Render customization
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
}

export const GridView: React.FC<GridViewProps> = ({
  // Data props
  items,
  itemType = 'file',
  // UI state props
  showActions = false,
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
  // Filter out "create button" items that shouldn't be draggable
  const regularItems = items.filter((item) => !item.isCreateButton);
  
  const gridRef = useRef<HTMLDivElement>(null) as React.MutableRefObject<HTMLDivElement | null>;
  const gridId = useRef(`grid-${Date.now()}-${Math.random().toString(36).substring(2, 4)}`);

  // Replace all drag/drop logic with the useItemDragDrop hook
  const { 
    targetIndex: cardTargetIndex, 
    dropAreaProps,
    dragItemProps,
  } = useItemDragDrop({
    items: regularItems,
    selectedItemIds,
    contentType: itemType,
    isDragSource,
    isDropTarget,
    containerRef: gridRef,
    dropZoneId,
    acceptedDropTypes,
    onAddItems,
    calculateDropTarget: calculateCardDropTarget,
  });

  return (
    <div ref={gridRef} id={gridId.current} className="audio-item-grid" {...dropAreaProps}>
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          <div
            {...dragItemProps(item)}
            className={`audio-item-card ${item.type} 
              ${item.isCreateButton ? 'create-collection-card' : ''} 
              ${selectedItemIds.includes(item.id) ? 'selected' : ''}
              ${index === cardTargetIndex! - 1 ? 'card-drop-target' : ''}`}
            onClick={(e) => onItemSelect(e, item.id)}
          >
            {item.isCreateButton && renderSpecialItem ? (
              renderSpecialItem(item)
            ) : (
              <div className="audio-item">
                <div className="audio-item-header">
                  <span className="item-icon">{getItemIcon(item)}</span>
                  <h4 className="audio-item-name">{item.name}</h4>
                </div>
                <div className="audio-item-details">
                  <span></span>
                  {item.itemCount !== undefined && <span className="item-count">{item.itemCount} items</span>}
                </div>

                {showActions && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <ItemActions
                      item={item}
                      selectedItemIds={selectedItemIds}
                      onPlayItem={onPlayItem}
                      onEditItem={onEditItem}
                      onRemoveItems={onRemoveItems}
                      isSmall
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

export default GridView;