import React from "react";
import {
  AudioItem,
  isAudioCollection,
  AudioItemActions,
  AudioCollection,
} from "../../../types.js";
//import { getItemIcon } from "../../utils/getItemIcon.js";
import ItemActions from "../../ItemActions.js";

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
  editItem,
  removeItems,
  onEditItem,
}) => {
  return (
    <div className="audio-item-content">
      <div className="audio-item-header">
        <h4 className="audio-item-name" title={item.name}>
          {/* <span className={`item-icon`}>
            {React.createElement(getItemIcon(item))}
          </span> */}
          {item.name}
          {item.type === "macro" && <span className="macro-indicator">M</span>}
        </h4>

        {showActions && (
          <div className="item-actions">
            <ItemActions
              collectionId={parentCollection.id}
              item={item}
              selectedItems={parentCollection.items?.filter((i) =>
                selectedItemIds.includes(i.id)
              )}
              removeItems={removeItems}
              editItem={editItem}
              onEditClick={onEditItem}
              isSmall
            />
          </div>
        )}
      </div>

      <div className="audio-item-details">
        {isAudioCollection(item) && item.itemCount !== undefined && (
          <span className="item-count">{item.itemCount} items</span>
        )}
      </div>
    </div>
  );
};

export default StandardItemContent;
