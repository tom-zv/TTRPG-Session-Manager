import React, { useCallback, useRef, useState } from "react";
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

const getInsertMarkerTop = (
  tableElement: HTMLElement | null,
  index: number
): number | null => {
  if (!tableElement) return null;
  if (index === 0) {
    return tableElement.querySelector("thead")?.clientHeight ?? 0;
  }

  const prevRow = tableElement.querySelector(
    `[data-item-index="${index - 1}"]`
  ) as HTMLElement | null;
  return prevRow ? prevRow.offsetTop + prevRow.offsetHeight : null;
};

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
  const [insertMarkerTop, setInsertMarkerTop] = useState<number | null>(null);

  const calculateListDropTarget = useCallback(
    (e: React.DragEvent, element: HTMLElement | null) => {
      const index = calculateTableDropIndex(e, element);
      if (index !== undefined) {
        const nextMarkerTop = getInsertMarkerTop(element, index);
        setInsertMarkerTop((currentMarkerTop) =>
          currentMarkerTop === nextMarkerTop ? currentMarkerTop : nextMarkerTop
        );
      }
      return index;
    },
    []
  );

  const { dropAreaProps, dragItemProps, targetIndex } = useItemDragDrop({
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
    calculateDropTarget: calculateListDropTarget,
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

          {targetIndex !== undefined && insertMarkerTop !== null && (
            <div
              className={styles.insertMarkerLine}
              style={{
                top: `${insertMarkerTop}px`,
              }}
            />
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
