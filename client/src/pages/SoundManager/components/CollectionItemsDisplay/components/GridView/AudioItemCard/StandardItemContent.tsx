import React from "react";
import styles from './AudioItemCard.module.css';
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
    <div className={styles.audioItemContent}>
      <div className={styles.audioItemHeader}>
        <div className={styles.playableItemTitle}>
          <h4 className={styles.audioItemName} title={item.name}>
            {/* <span className={`item-icon`}>
              {React.createElement(getItemIcon(item))}
            </span> */}
            {item.name}
            {item.type === "macro" && <span className="macro-indicator">M</span>}
          </h4>

          {isAudioCollection(item) && item.itemCount !== undefined && (
            <span className={styles.audioItemInfo}>
              {item.itemCount === 0 ? "empty" : `${item.itemCount} items`}
            </span>
          )}
        </div>

        {showActions && (
          <div className={styles.itemActions}>
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
    </div>
  );
};

export default StandardItemContent;
