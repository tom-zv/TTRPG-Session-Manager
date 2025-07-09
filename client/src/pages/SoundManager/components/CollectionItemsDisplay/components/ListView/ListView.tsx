import React, { useRef } from "react";
import { AudioItemActions, AudioCollection, AudioItem } from "../../types.js";

import { DragDropProps } from "src/types/dragDropProps.js";
import { useItemDragDrop } from "../../hooks/useItemDragDrop.js";
import { calculateTableDropIndex } from "src/utils/tableDropUtils.js";
import { isAudioFile } from "../../../../types/AudioItem.js";
import { Audio } from "../../../../services/AudioService/AudioContext.js";
import { getColumns, renderCell } from "./listViewColumns.js";

import "./ListView.css";
import { ListViewTableHeader } from "./ListViewTableHeader.js";

interface ListViewProps extends AudioItemActions, DragDropProps {
  collection: AudioCollection;
  selectedItemIds?: number[];
  showActions?: boolean;
  showHeaders?: boolean;
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

  const columns = getColumns(collection);

  const handlePlayItem = (item: AudioItem) => {
    audioContext.toggleAudioItem(item, collection);
  };

  // Compose row className
  const getRowClassName = (
    item: AudioItem,
    isPlaying: boolean,
    isAmbienceActive: boolean,
    isCurrentTrack: boolean,
    dragClass: string
  ) =>
    [
      "audio-item-row",
      item.type,
      selectedItemIds.includes(item.id) && "selected",
      isPlaying && "playing",
      isAmbienceActive && "active",
      isCurrentTrack && "current-track",
      dragClass,
    ]
      .filter(Boolean)
      .join(" ");

  // Calculate insert marker position
  const getInsertMarkerTop = (index: number) => {
    if (index === 0) {
      return `${tableRef.current?.querySelector("thead")?.offsetHeight || 0}px`;
    }
    const prevRow = tableRef.current?.querySelector(
      `[data-item-index="${index - 1}"]`
    ) as HTMLElement | null;
    return prevRow ? `${prevRow.offsetTop + prevRow.offsetHeight}px` : "0px";
  };

  return (
    <div
      {...dropAreaProps}
      className={[
        "audio-item-list-view",
        collection.type === "macro" && "macro-list-view",
        isEmpty && "empty-list-view",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!isEmpty && (
        <div className="table-wrapper">
          <table ref={tableRef} className="audio-item-table">
            <ListViewTableHeader
              columns={columns}
              showHeaders={showHeaders}
              showActions={showActions}
            />

            <tbody>
              {items.map((item, index) => {
                // Determine item state
                const isPlaying = audioContext.isAudioItemPlaying(
                  item,
                  collection
                );

                const isAmbienceActive = !!(
                  isAudioFile(item) &&
                  item.audioType === "ambience" &&
                  item.active
                );

                const isCurrentTrack =
                  collection.type === "playlist" &&
                  audioContext.playlist?.currentPlaylistId === collection.id &&
                  audioContext.playlist?.currentIndex === item.position;

                const dragProps = dragItemProps(item);
                const rowClassName = getRowClassName(
                  item,
                  isPlaying,
                  isAmbienceActive,
                  isCurrentTrack,
                  dragProps.className || ""
                );

                return (
                  <tr
                    key={`${item.type}-${item.id}`}
                    {...dragProps}
                    className={rowClassName}
                    onClick={(e) => onItemSelect?.(e, item.id)}
                    aria-selected={selectedItemIds.includes(item.id)}
                    data-item-index={index}
                  >
                    {columns.map((column) =>
                      renderCell(
                        column,
                        item,
                        collection,
                        showActions,
                        selectedItemIds,
                        items,
                        removeItems,
                        onEditItem,
                        handlePlayItem
                      )
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Absolutely positioned insert markers */}
          {Array.from({ length: items.length + 1 }, (_, index) =>
            isInsertionPoint(index) ? (
              <div
                key={`insert-marker-${index}`}
                className="insert-marker-line"
                style={{
                  top: getInsertMarkerTop(index),
                }}
              />
            ) : null
          )}
        </div>
      )}
      {isEmpty && isDropTarget && (
        <div ref={tableRef} className="empty-table-drop-area"></div>
      )}
    </div>
  );
};

export default ListView;
