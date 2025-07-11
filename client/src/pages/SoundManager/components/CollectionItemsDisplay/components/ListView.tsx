import React, { useRef } from "react";
import { AudioItem, AudioCollection, AudioItemActions } from "../index.js";
import ItemActions from "./ItemActions.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import { useItemDragDrop } from "../hooks/useItemDragDrop.js";
import { calculateTableDropIndex } from "src/utils/tableDropUtils.js";
import { isAudioFile, isAudioMacro } from "../../../types/AudioItem.js";
import { getItemIcon } from "../utils/getItemIcon.js";
import { Audio } from "../../../services/AudioService/AudioContext.js";

import "./ListView.css";

interface ListViewProps extends AudioItemActions, DragDropProps {
  // Data props
  collection: AudioCollection;
  // UI state props
  selectedItemIds?: number[];
  showActions?: boolean | null;
  showHeaders?: boolean;
  // Event handlers
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
  onEditItem?: (itemId: number) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  collection,
  selectedItemIds = [],
  showActions = false,
  showHeaders = true,
  onItemSelect,
  onEditItem,
  addItems,
  removeItems,
  updateItemPosition,
  // Drag and drop control props
  isDragSource = false,
  isReorderable = true,
  isDropTarget = false,
  dropZoneId,
  acceptedDropTypes = [],
}) => {
  const items = collection.items || [];
  const audioContext = Audio.useAudio();
  const isEmpty = items.length === 0;

  const tableRef = useRef<HTMLTableElement | null>(null);

  const { dropAreaProps, dragItemProps, isInsertionPoint } = useItemDragDrop({
    items,
    selectedItemIds,
    contentType: collection.type === "macro" ? "macro" : "file",
    isDragSource,
    isReorderable,
    isDropTarget,
    dropZoneId,
    acceptedDropTypes,
    containerRef: tableRef,
    addItems,
    updateItemPosition,
    calculateDropTarget: calculateTableDropIndex,
  });

  let columns: string[] = [];

  switch (collection.type) {
    case "pack":
      columns = ["icon", "name"];
      break;
    case "playlist":
      columns = ["position", "name", "duration", "actions"];
      if (collection.id < 0) {
        columns = ["name", "actions"];
      }
      break;
    case "macro":
      columns = ["name", "actions"];
      break;
    default:
      columns = ["position", "name", "duration", "actions"];
  }

  const handlePlayItem = (item: AudioItem) => {
    audioContext.toggleAudioItem(item, collection);
  };

  // Helper function to render a cell based on column type
  const renderCell = (column: string, item: AudioItem) => {
    switch (column) {
      case "id":
        return <td key={column}>{item.id}</td>;
      case "icon":
        return (
          <td key={column} className="icon-cell">
            {(() => {
              const IconComponent = getItemIcon(item);
              return <IconComponent />;
            })()}
          </td>
        );
      case "position":
        return (
          <td key={column}>
            <div className="position-cell">
              <span className="position-number">{item.position! + 1}</span>
              <button
                className="position-play-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayItem(item);
                }}
                aria-label="Play"
              >
                ▶
              </button>
            </div>
          </td>
        );
      case "name":
        return (
          <td key={column}>
            <div className="item-name-cell">
              <span className="item-name-text">{item.name}</span>
              {collection.type !== "macro" && item.type === "macro" && (
                <span className="macro-indicator">Macro</span>
              )}
            </div>
          </td>
        );
      case "duration":
        return (
          <td key={column}>
            {(isAudioFile(item) || isAudioMacro(item)) &&
              item.duration &&
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
              collectionId={collection.id}
              item={item}
              selectedItems={items.filter((i) =>
                selectedItemIds.includes(i.id)
              )}
              removeItems={removeItems}
              onEditClick={onEditItem}
              isSmall
            />
          </td>
        ) : null;
      default:
        return <td key={column}>{item[column as keyof AudioItem]}</td>;
    }
  };

  return (
    <div
      {...dropAreaProps}
      className={`audio-item-list-view ${collection.type === "macro" ? "macro-list-view" : ""} ${isEmpty ? "empty-list-view" : ""}`}
    >
      {!isEmpty && (
        <div className="table-wrapper">
          <table ref={tableRef} className="audio-item-table">
            <thead>
              <tr>
                {showHeaders &&
                  columns.map((column) => {
                    if (column === "position") return <th key={column}>#</th>;
                    if (column === "actions" && !showActions) return null;
                    if (column === "actions")
                      return (
                        <th key={column} className="actions-column">
                          Actions
                        </th>
                      );
                    return (
                      <th key={column}>
                        {column.charAt(0).toUpperCase() + column.slice(1)}
                      </th>
                    );
                  })}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                // Determine if the item is playing based on its type and collection context
                const isPlaying = audioContext.isAudioItemPlaying(
                  item,
                  collection
                );

                // Special handling for ambience files - they can be active even when not playing
                const isAmbienceActive =
                  isAudioFile(item) &&
                  item.audioType === "ambience" &&
                  item.active;

                // Check if this item is the current track in a playlist, even if it's not playing
                const isCurrentTrack =
                  collection.type === "playlist" &&
                  audioContext.playlist?.currentPlaylistId === collection.id &&
                  audioContext.playlist?.currentIndex === item.position;

                return (
                  <tr
                    key={`${item.type}-${item.id}`}
                    {...(() => {
                      const dragProps = dragItemProps(item);
                      const combinedClassName = `
                        audio-item-row 
                        ${item.type} 
                        ${selectedItemIds.includes(item.id) ? "selected" : ""} 
                        ${isPlaying ? "playing" : ""}
                        ${isAmbienceActive ? "active" : ""}
                        ${isCurrentTrack ? "current-track" : ""}
                        ${dragProps.className || ""}
                      `.trim();
                      return { ...dragProps, className: combinedClassName };
                    })()}
                    onClick={(e) =>
                      onItemSelect ? onItemSelect(e, item.id) : undefined
                    }
                    aria-selected={selectedItemIds.includes(item.id)}
                    data-item-index={index}
                  >
                    {columns.map((column) => renderCell(column, item))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {/* Absolutely positioned insert markers */}
          {Array.from({ length: items.length + 1 }, (_, index) => {
            if (!isInsertionPoint(index)) return null;
            
            return (
              <div
                key={`insert-marker-${index}`}
                className="insert-marker-line"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: '2px',
                  backgroundColor: 'var(--accent-primary)',
                  zIndex: 10,
                  top: index === 0 
                    ? `${tableRef.current?.querySelector('thead')?.offsetHeight || 0}px`
                    : `${(tableRef.current?.querySelector(`[data-item-index="${index - 1}"]`) as HTMLElement)?.offsetTop + (tableRef.current?.querySelector(`[data-item-index="${index - 1}"]`) as HTMLElement)?.offsetHeight || 0}px`
                }}
              />
            );
          })}
        </div>
      )}
      {isEmpty && isDropTarget && (
        <div ref={tableRef} className="empty-table-drop-area"></div>
      )}
    </div>
  );
};

export default ListView;
