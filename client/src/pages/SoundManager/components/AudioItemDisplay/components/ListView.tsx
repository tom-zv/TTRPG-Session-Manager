import React from "react";
import { AudioItem, AudioItemActions } from "../index.js";
import { ItemActions, PlayItem } from "./ItemActions.js";

interface ListViewProps extends AudioItemActions {
  items: AudioItem[];
  showPlayButton?: boolean;
  showActions?: boolean | null;
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
  selectedItemIds?: number[];
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  items,
  showPlayButton = false,
  showActions = false,
  onPlayItem,
  onEditItem,
  onRemoveItem,
  renderSpecialItem,
  selectedItemIds = [],
  onItemSelect,
}) => {
  const regularItems = items.filter((item) => !item.isCreateButton);
  const createButtonItem = items.find((item) => item.isCreateButton);

  return (
    <div className="audio-item-list-view">
      <table className="audio-item-table">
        <thead>
          <tr>
            {showPlayButton && <th aria-label="Play"></th>}
            <th>Title</th>
            <th>Duration</th>
            {showActions && <th className="actions-column">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {regularItems.map((item) => (
            <tr
              key={item.id}
              className={`audio-item-row ${item.type} ${selectedItemIds.includes(item.id) ? "selected" : ""}`}
              onClick={(e) =>
                onItemSelect ? onItemSelect(e, item.id) : undefined
              }
              draggable
              aria-selected={selectedItemIds.includes(item.id)}
            >
              {showPlayButton && (
                <td>
                  <PlayItem item={item} onPlayItem={onPlayItem} />
                </td>
              )}
              <td>
                <div className="item-title-cell"> {item.title} </div>
              </td>
              <td>{item.duration}</td>
              {showActions && (
                <td onClick={(e) => e.stopPropagation()}>
                  <ItemActions
                    item={item}
                    onPlayItem={onPlayItem}
                    onEditItem={onEditItem}
                    onRemoveItem={onRemoveItem}
                    isSmall
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {createButtonItem && renderSpecialItem && (
        <div
          className="create-button-list-view"
          onClick={(e) =>
            onItemSelect ? onItemSelect(e, createButtonItem.id) : undefined
          }
          role="button"
          aria-label="Create new item"
        >
          {renderSpecialItem(createButtonItem)}
        </div>
      )}
    </div>
  );
};

export default ListView;
