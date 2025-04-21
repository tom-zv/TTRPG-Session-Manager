import React from 'react';
import { AudioItem, isAudioCollection, AudioItemActions, AudioCollection } from '../../types.js';
import { getItemIcon } from '../../utils/getItemIcon.js';
import ItemActions from '../ItemActions.js';


interface StandardItemContentProps extends AudioItemActions {
  item: AudioItem;
  parentCollection: AudioCollection;
  showActions: boolean;
  selectedItemIds: number[];
  onEditItem?: (itemId: number) => void; 
}

const StandardItemContent: React.FC<StandardItemContentProps> = ({
  item,
  parentCollection,
  showActions,
  selectedItemIds,
  useEditItem,
  useRemoveItems,
  onEditItem, 
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
            collectionId={parentCollection.id}
            item={item}
            selectedItems={parentCollection.items?.filter((i) => selectedItemIds.includes(i.id))}
            useRemoveItems={useRemoveItems} 
            useEditItem={useEditItem} 
            onEditClick={onEditItem} 
            isSmall
          />
        </div>
      )}
    </div>
  );
};

export default StandardItemContent;