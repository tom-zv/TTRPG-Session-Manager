import { useCallback, useState } from "react";

export type dragMode = "file-transfer" | "reorder";

interface UseDragSourceOptions<T> {
  contentType: string;
  mode: dragMode;
  getItemId: (item: T) => number;
  onDragStart?: (items: T[]) => void;
  onDragEnd?: () => void;
  getItemName?: (item: T) => string;
}

export function useDragSource<T>({
  contentType,
  mode,
  getItemId,
  onDragStart,
  onDragEnd,
  getItemName = (item: T) => `Item ${getItemId(item)}`,
}: UseDragSourceOptions<T>) {
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const createMultiDragImage = useCallback(
    (items: T[]) => {
      const container = document.createElement("div");
      container.className = "drag-image-container";

      items.slice(0, 10).forEach((item, index) => {
        const itemElement = document.createElement("div");
        itemElement.className = `drag-image-item drag-item-${index + 1}`;
        itemElement.textContent = getItemName(item);
        container.appendChild(itemElement);
      });

      if (items.length > 10) {
        const countIndicator = document.createElement("div");
        countIndicator.className = "drag-count-indicator";
        countIndicator.textContent = `+${items.length - 10} more`;
        container.appendChild(countIndicator);
      }

      document.body.appendChild(container);
      return container;
    },
    [getItemName]
  );

  // Gets the items to be dragged,
  const handleDragStart = useCallback(
    (e: React.DragEvent, items: T[]) => {
      e.stopPropagation();
      setIsDragging(true);

      // Create the payload
      const payload = {
        contentType,
        mode,
        items,
        count: items.length,
      };

      console.log("Drag payload:", payload);

      // Set the data transfer
      e.dataTransfer.setData("application/json", JSON.stringify(payload));

      // Apply visual indicators
      if (items.length > 1) {
        e.currentTarget.classList.add("dragging-multi");
        e.currentTarget.setAttribute(
          "data-count",
          items.length.toString()
        );

        // Create and set custom drag image for multiple items
        const dragImage = createMultiDragImage(items);
        e.dataTransfer.setDragImage(dragImage, 30, 30);

        // Clean up the drag image element after a short delay
        setTimeout(() => {
          document.body.removeChild(dragImage);
        }, 100);
      } else {
        e.currentTarget.classList.add("dragging");
      }

      onDragStart?.(items);
    },
    [contentType, onDragStart, createMultiDragImage, mode]
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(false);
      e.currentTarget.classList.remove("dragging", "dragging-multi");
      onDragEnd?.();
    },
    [onDragEnd]
  );

  return {
    isDragging,
    handleDragStart,
    handleDragEnd,
  };
}
