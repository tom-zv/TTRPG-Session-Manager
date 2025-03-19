import React, { useRef, useState } from "react";
import { AudioItem, AudioItemActions } from "../index.js";
import { ItemActions, PlayItem } from "./ItemActions.js";
import { useDropTarget } from "src/hooks/useDropTarget.js";
import { calculateTableDropIndex } from "src/utils/tableDropUtils.js";
import { useDragSource } from "src/hooks/useDragSource.js";

interface ListViewProps extends AudioItemActions {
  items: AudioItem[];
  selectedItemIds?: number[];
  showPlayButton?: boolean;
  showActions?: boolean | null;
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
  onUpdateItemPosition?: (
    itemId: number,
    targetPosition: number,
    sourceStartPosition?: number,
    sourceEndPosition?: number
  ) => Promise<void>;
}

export const ListView: React.FC<ListViewProps> = ({
  items,
  selectedItemIds = [],
  showPlayButton = false,
  showActions = false,
  onPlayItem,
  onEditItem,
  onAddItems,
  onRemoveItems,
  renderSpecialItem,
  onItemSelect,
  onUpdateItemPosition,
}) => {
  const regularItems = items.filter((item) => !item.isCreateButton);
  const createButtonItem = items.find((item) => item.isCreateButton);
  const tableRef = useRef<HTMLTableElement>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | undefined>(
    undefined
  );

  const calculateDropIndex = (e: React.DragEvent) => {
    const index = calculateTableDropIndex(e, tableRef.current);
    if (index !== undefined) {
      setDropTargetIndex(index);
    }
    return index;
  };

  // Drag source for reordering items
  const itemDragSource = useDragSource<AudioItem>({
    contentType: "audio-file",
    mode: "reorder",
    getItemsForDrag: (selectedItemIds) => {
      return regularItems.filter((item) => selectedItemIds.includes(item.id));
    },
    getItemId: (item) => item.id,
    onDragEnd: () => setDropTargetIndex(undefined),
    getItemName: (item) => item.title,
  });

  // Create drop target
  const { dropAreaProps } = useDropTarget<AudioItem>({
    acceptedTypes: ["audio-file"],
    onItemsDropped: async (items, context) => {
      const { index, mode } = context;
      // Handle reordering
      if (mode === "reorder" && onUpdateItemPosition && items.length > 0) {
         
        const sourceStartPosition = items[0].position;
        const sourceEndPosition = items[items.length - 1].position;

        if ((sourceStartPosition! <= index!) && (index! <= sourceEndPosition! + 1)) { // If the item is dropped within range, don't update. 
          console.log("Item dropped within range, not updating");
          setDropTargetIndex(undefined);
          return;
        }
        
        if (items.length > 1) {
          // For multiple items, include source positions
          await onUpdateItemPosition(
            items[0].id,
            index!,
            sourceStartPosition,
            sourceEndPosition
          );
        } else {
          // Single file reordering
          await onUpdateItemPosition(items[0].id, index!);
        }
        // Handle file transfer
      } else if (mode === "file-transfer" && onAddItems) {
        if (items.length > 0) {
          onAddItems(items, index);
        }
        setDropTargetIndex(undefined);
      }
    },
    calculateDropIndex,
  });

  // Helper function to determine if this row has the insert marker
  const isInsertionPoint = (index: number) => dropTargetIndex === index;

  return (
    <div {...dropAreaProps}>
      <table ref={tableRef} className="audio-item-table">
        <thead>
          <tr>
            {showPlayButton && <th aria-label="Play"></th>}
            <th>#</th>
            <th>Title</th>
            <th>Duration</th>
            {showActions && <th className="actions-column">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {/* Insert marker for the first position */}
          {isInsertionPoint(0) && (
            <tr className="insert-marker">
              <td colSpan={showPlayButton ? 5 : 4}></td>
            </tr>
          )}

          {regularItems.map((item, index) => (
            <React.Fragment key={item.id}>
              <tr
                className={`audio-item-row ${item.type} ${selectedItemIds.includes(item.id) ? "selected" : ""}`}
                onClick={(e) =>
                  onItemSelect ? onItemSelect(e, item.id) : undefined
                }
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  
                  // If the item isn't in the selection, drag just this item
                  const itemsToUse = selectedItemIds.includes(item.id) 
                    ? selectedItemIds 
                    : [item.id];
                    
                  itemDragSource.handleDragStart(e, item, itemsToUse);
                }}
                onDragEnd={itemDragSource.handleDragEnd}
                aria-selected={selectedItemIds.includes(item.id)}
                data-item-id={item.id}
              >
                {showPlayButton && (
                  <td>
                    <PlayItem item={item} onPlayItem={onPlayItem} />
                  </td>
                )}
                <td>{item.position}</td>{/* Add +1 for one-index display*/}
                <td>
                  <div className="item-title-cell"> {item.title} </div>
                </td>
                <td>
                  {item.duration &&
                    new Date(item.duration * 1000)
                      .toISOString()
                      .slice(11, 19)
                      .replace(/^00:/, "")
                      .replace(/^0/, "")}
                </td>
                {showActions && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <ItemActions
                      item={item}
                      selectedItemIds={selectedItemIds}
                      onPlayItem={onPlayItem}
                      onEditItem={onEditItem}
                      onRemoveItems={onRemoveItems}
                      isSmall
                    />
                  </td>
                )}
              </tr>

              {/* Insert marker after this row */}
              {isInsertionPoint(index + 1) && (
                <tr className="insert-marker">
                  <td colSpan={showPlayButton ? 5 : 4}></td>
                </tr>
              )}
            </React.Fragment>
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
