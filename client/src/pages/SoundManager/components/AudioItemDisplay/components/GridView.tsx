import React from 'react';
import { AudioItem, AudioItemActions } from '../index.js';
import { getItemIcon } from '../utils/getItemIcon.js';
import ItemActions from './ItemActions.js';

interface GridViewProps extends AudioItemActions {
  items: AudioItem[];
  showActions?: boolean | null;
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
  selectedItemIds?: number[];
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
}

export const GridView: React.FC<GridViewProps> = ({
  items,
  showActions = false,
  onItemClick,
  onPlayItem,
  onEditItem,
  onRemoveItem,
  renderSpecialItem,
  selectedItemIds = [],
  onItemSelect
}) => {
  const handleItemClick = (e: React.MouseEvent, itemId: number) => {
    if (onItemClick) {
      e.stopPropagation();
      onItemClick(itemId);
    }
  };

  return (
    <div className="audio-item-grid">
      {items.map((item) => (
        <div
          key={item.id}
          className={`audio-item-card ${item.type} ${item.isCreateButton ? 'create-collection-card' : ''} ${selectedItemIds.includes(item.id) ? 'selected' : ''}`}
          onClick={(e) => onItemSelect ? onItemSelect(e, item.id) : handleItemClick(e, item.id)}
        >
          {item.isCreateButton && renderSpecialItem ? (
            renderSpecialItem(item)
          ) : (
            <div className="audio-item">
              <div className="audio-item-header">
                <span className="item-icon">{getItemIcon(item)}</span>
                <h4 className="audio-item-title">{item.title}</h4>
              </div>
              <div className="audio-item-details">
                <span></span>
                {item.itemCount !== undefined && (
                  <span className="item-count">{item.itemCount} items</span>
                )}
              </div>
              
              {showActions && (
                <div onClick={(e) => e.stopPropagation()}>
                  <ItemActions
                    item={item}
                    onPlayItem={onPlayItem}
                    onEditItem={onEditItem}
                    onRemoveItem={onRemoveItem}
                    isSmall
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default GridView;