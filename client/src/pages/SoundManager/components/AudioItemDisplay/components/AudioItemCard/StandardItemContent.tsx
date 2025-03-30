import React from 'react';
import { AudioItem, isAudioCollection } from '../../types.js';
import { getItemIcon } from '../../utils/getItemIcon.js';
import ItemActions from '../ItemActions.js';

interface StandardItemContentProps {
  item: AudioItem;
  showActions: boolean;
  selectedItemIds: number[];
  onPlayItem?: (itemId: number) => void;
  onEditItem?: (itemId: number, params: any) => void;
  onRemoveItems?: (itemIds: number[]) => void;
}

const StandardItemContent: React.FC<StandardItemContentProps> = ({
  item,
  showActions,
  selectedItemIds,
  onPlayItem,
  onEditItem,
  onRemoveItems
}) => {
  return (
    <div className="audio-item">
      <div className="audio-item-header">
        <span className="item-icon">{getItemIcon(item)}</span>
        <h4 className="audio-item-name">
          {item.name}
          {item.type === "macro" && (
            <span className="macro-indicator">M</span>
          )}
        </h4>
      </div>
      <div className="audio-item-details">
        <span></span>
        {isAudioCollection(item) && item.itemCount !== undefined && (
          <span className="item-count">{item.itemCount} items</span>
        )}
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
  );
};

export default StandardItemContent;