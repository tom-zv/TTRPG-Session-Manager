import React, { useRef } from "react";
import { AudioItem, AudioItemActions } from "../index.js";
import { ItemActions, PlayItem } from "./ItemActions.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import { useItemDragDrop } from '../hooks/useItemDragDrop.js';
import { calculateTableDropIndex } from "src/utils/tableDropUtils.js";

interface ListViewProps extends AudioItemActions, DragDropProps {
  // Data props
  items: AudioItem[];
  itemType: string;
  
  // UI state props
  selectedItemIds?: number[];
  showPlayButton?: boolean;
  showActions?: boolean | null;
  
  // Event handlers
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
  
  // Render customization
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
}

export const ListView: React.FC<ListViewProps> = ({
  items,
  itemType,
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
  // drag and drop control props
  isDragSource = false,
  isDropTarget = false,
}) => {
  const regularItems = items.filter((item) => !item.isCreateButton);
  const createButtonItem = items.find((item) => item.isCreateButton);
  const tableRef = useRef<HTMLTableElement | null>(null);

  const { 
    dropAreaProps,
    dragItemProps,
    isInsertionPoint,
  } = useItemDragDrop({
    items: regularItems,
    selectedItemIds,
    contentType: itemType,
    isDragSource,
    isReordering: true, // ListView supports reordering
    isDropTarget,
    containerRef: tableRef, 
    onAddItems,
    onUpdateItemPosition,
    calculateDropTarget: calculateTableDropIndex,
  });

  let columns:string[] = [];
  
  switch(itemType){
    case "pack":
      columns = ["name", "actions"];
      break;
    default:
      columns = ["id", "name", "duration", "actions"];
  }

  // Calculate the total number of columns for colSpan
  const columnCount = columns.length + (showPlayButton ? 1 : 0);

  // Helper function to render a cell based on column type
  const renderCell = (column: string, item: AudioItem) => {
    switch(column) {
      case "id":
        return <td key={column}>{item.position}</td>;
      case "name":
        return (
          <td key={column}>
            <div className="item-name-cell">{item.name}</div>
          </td>
        );
      case "duration":
        return (
          <td key={column}>
            {item.duration &&
              new Date(item.duration * 1000)
                .toISOString()
                .slice(11, 19)
                .replace(/^00:/, "")
                .replace(/^0/, "")}
          </td>
        );
      case "actions":
        return showActions ? (
          <td key={column} onClick={(e) => e.stopPropagation()}>
            <ItemActions
              item={item}
              selectedItemIds={selectedItemIds}
              onPlayItem={onPlayItem}
              onEditItem={onEditItem}
              onRemoveItems={onRemoveItems}
              isSmall
            />
          </td>
        ) : null;
      default:
        return <td key={column}>{item[column as keyof AudioItem]}</td>;
    }
  };

  return (
    <div {...dropAreaProps}>
      <table ref={tableRef} className="audio-item-table">
        <thead>
          <tr>
            {showPlayButton && <th aria-label="Play"></th>}
            {columns.map(column => {
              if (column === "id") return <th key={column}>#</th>;
              if (column === "actions" && !showActions) return null;
              if (column === "actions") return <th key={column} className="actions-column">Actions</th>;
              return <th key={column}>{column.charAt(0).toUpperCase() + column.slice(1)}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {/* Insert marker for the first position */}
          {isInsertionPoint(0) && (
            <tr className="insert-marker">
              <td colSpan={columnCount}></td>
            </tr>
          )}

          {regularItems.map((item, index) => (
            <React.Fragment key={item.id}>
              <tr
                {...(() => {
                  const dragProps = dragItemProps(item);
                  const combinedClassName = `audio-item-row ${item.type} ${selectedItemIds.includes(item.id) ? "selected" : ""} ${dragProps.className || ""}`.trim();
                  return { ...dragProps, className: combinedClassName };
                })()}
                onClick={(e) => onItemSelect ? onItemSelect(e, item.id) : undefined}
                aria-selected={selectedItemIds.includes(item.id)}
                data-item-id={item.id}
              >
                {showPlayButton && (
                  <td>
                    <PlayItem item={item} onPlayItem={onPlayItem} />
                  </td>
                )}
                {columns.map(column => renderCell(column, item))}
              </tr>

              {/* Insert marker after this row */}
              {isInsertionPoint(index + 1) && (
                <tr className="insert-marker">
                  <td colSpan={columnCount}></td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {createButtonItem && renderSpecialItem && (
        <div
          className="create-button-list-view"
          onClick={(e) => onItemSelect ? onItemSelect(e, createButtonItem.id) : undefined}
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
