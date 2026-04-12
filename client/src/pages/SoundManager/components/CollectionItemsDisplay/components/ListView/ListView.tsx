import React, { useRef } from "react";
import { AudioItemActions, AudioCollection, AudioItem } from "../../types.js";

import { DragDropProps } from "src/types/dragDropProps.js";
import { useItemDragDrop } from "../../hooks/useItemDragDrop.js";
import { calculateTableDropIndex } from "src/utils/tableDropUtils.js";
import {
  useAudioItemControls,
  useAudioItemState,
  type AudioItemPlayState,
} from "../../../../services/AudioService/AudioContext.js";
import { getColumns, renderCell } from "./listViewColumns.js";

import styles from "./ListView.module.css";
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
  const { toggleAudioItem } = useAudioItemControls();
  const { getAudioItemPlayState, isCurrentPlaylistTrack } =
    useAudioItemState();
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
    toggleAudioItem(item, collection);
  };

  // Compose row className
  const getRowClassName = (
    item: AudioItem,
    playState: AudioItemPlayState,
    isCurrentTrack: boolean,
    dragClass: string
  ) =>
    [
      "audio-item-row",
      item.type,
      selectedItemIds.includes(item.id) && "selected",
      playState === "playing" && "playing",
      playState === "active" && "active",
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
        styles.audioItemListView,
        collection.type === "macro" && styles.macroListView,
        isEmpty && styles.emptyListView,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!isEmpty && (
        <div className={styles.tableWrapper}>
          <table ref={tableRef} className="audio-item-table">
            <ListViewTableHeader
              columns={columns}
              showHeaders={showHeaders}
              showActions={showActions}
            />

            <tbody>
              {items.map((item, index) => {
                // Determine item state
                const playState = getAudioItemPlayState(
                  item,
                  collection
                );

                const isCurrentTrack = isCurrentPlaylistTrack(item, collection);

                const dragProps = dragItemProps(item);
                const rowClassName = getRowClassName(
                  item,
                  playState,
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
                    data-type={item.audioType}
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
                className={styles.insertMarkerLine}
                style={{
                  top: getInsertMarkerTop(index),
                }}
              />
            ) : null
          )}
        </div>
      )}
      {isEmpty && isDropTarget && (
        <div ref={tableRef} className={styles.emptyTableDropArea}></div>
      )}
    </div>
  );
};

export default ListView;
