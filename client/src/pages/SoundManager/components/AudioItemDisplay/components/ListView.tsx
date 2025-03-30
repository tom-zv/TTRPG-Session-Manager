import React, { useRef } from "react";
import { AudioItem, AudioItemActions } from "../index.js";
import ItemActions  from "./ItemActions.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import { useItemDragDrop } from '../hooks/useItemDragDrop.js';
import { calculateTableDropIndex } from "src/utils/tableDropUtils.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import { isAudioFile, isAudioMacro,} from "../../../types/AudioItem.js";
import { getItemIcon } from '../utils/getItemIcon.js';
import './ListView.css';

interface ListViewProps extends AudioItemActions, DragDropProps {
  // Data props
  items: AudioItem[];
  collectionType: string;
  // UI state props
  selectedItemIds?: number[];
  showPlayButton?: boolean;
  showActions?: boolean | null;
  showHeaders?: boolean;
  // Event handlers
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  items,
  collectionType,
  selectedItemIds = [],
  showActions = false,
  showHeaders = true,
  onItemSelect,
  onPlayItem,
  onEditItem,
  onAddItems,
  onRemoveItems,
  onUpdateItemPosition,
  // drag and drop control props
  isDragSource = false,
  isReorderable = true,
  isDropTarget = false,
  acceptedDropTypes = [],
}) => {
  const tableRef = useRef<HTMLTableElement | null>(null);

  const { 
    dropAreaProps,
    dragItemProps,
    isInsertionPoint,
  } = useItemDragDrop({
    items: items,
    selectedItemIds,
    contentType: 'file',
    isDragSource,
    isReorderable, 
    isDropTarget,
    dropZoneId: DROP_ZONES.SOUND_MANAGER_CONTENT,
    acceptedDropTypes,
    containerRef: tableRef, 
    onAddItems,
    onUpdateItemPosition,
    calculateDropTarget: calculateTableDropIndex,
  });

  let columns:string[] = [];
  
  switch(collectionType){
    case "pack":
      columns = ["icon", "name", "type"];
      break;
    case "playlist":
      columns = ["position", "name", "duration", "actions"];
      break;
    case "macro":
      columns = ["-" ,"name"];
      break;
    default:
      columns = ["position", "name", "duration", "actions"];
  }

  // Calculate the total number of columns for colSpan
  const columnCount = columns.length ;

  // Helper function to render a cell based on column type
  const renderCell = (column: string, item: AudioItem) => {
    switch(column) {
      case "id":
        return <td key={column}>{item.id}</td>;
      case "icon":
        return <td key={column} className="icon-cell">{getItemIcon(item)}</td>;
      case "position":
        return (
          <td key={column}>
            <div className="position-cell">
              <span className="position-number">{item.position! + 1}</span>
              {onPlayItem && (
                <button
                  className="position-play-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPlayItem) onPlayItem(item.id);
                  }}
                  aria-label="Play"
                >
                  ▶
                </button>
              )}
            </div>
          </td>
        );
      case "name":
        return (
          <td key={column}>
            <div className="item-name-cell">
              {item.name}
              {collectionType !== "macro" && item.type === "macro" && (
                <span className="macro-indicator">Macro</span>
              )}
            </div>
          </td>
        );
      case "duration":
        return (
          <td key={column}>
            {(isAudioFile(item) || isAudioMacro(item)) && item.duration &&
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
    <div {...dropAreaProps} className={collectionType === "macro" ? "macro-list-view" : ""}>
      <table ref={tableRef} className="audio-item-table">
        <thead>
          <tr>
            {/* {showPlayButton && <th aria-label="Play"></th>} */}
            {showHeaders && columns.map(column => {
              if (column === "position") return <th key={column}>#</th>;
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

          {items.map((item, index) => (
            <React.Fragment key={`${item.type}-${item.id}`}>
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
                {/* {showPlayButton && (
                  <td>
                    <PlayItem item={item} onPlayItem={onPlayItem} />
                  </td>
                )} */}
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
    </div>
  );
};

export default ListView;
