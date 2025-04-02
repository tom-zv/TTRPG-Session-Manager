import React from 'react';
import { AudioItem, isAudioCollection, AudioItemActions } from '../../types.js';
import { getItemIcon } from '../../utils/getItemIcon.js';
import ItemActions from '../ItemActions.js';


interface StandardItemContentProps extends AudioItemActions {
  item: AudioItem;
  collectionId: number;
  showActions: boolean;
  selectedItemIds: number[];
}

const StandardItemContent: React.FC<StandardItemContentProps> = ({
  item,
  collectionId,
  showActions,
  selectedItemIds,
  useEditItem,
  useRemoveItems,
}) => {
 
  return (
    <div className="audio-item">
      <div className="audio-item-header">
        <span className={`item-icon`}>
          {getItemIcon(item)}
        </span>
        <h4 className="audio-item-name">
          {item.name}
          {item.type === "macro" && (
            <span className="macro-indicator">M</span>
          )}
        </h4>
      </div>
      <div className="audio-item-details">
        {isAudioCollection(item) && item.itemCount !== undefined && (
          <span className="item-count">{item.itemCount} items</span>
        )}
      </div>

      {showActions && (
        <div className="item-actions">
          <ItemActions
            collectionId={collectionId}
            item={item}
            selectedItemIds={selectedItemIds}
            useRemoveItems={useRemoveItems} // Use mutation for remove
            useEditItem={useEditItem} // Pass mutation for edit
            isSmall
          />
        </div>
      )}
    </div>
  );
};

export default StandardItemContent;