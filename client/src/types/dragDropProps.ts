export interface DragDropProps {
  isDragSource?: boolean;
  isReordering?: boolean;
  isDropTarget?: boolean;
  dropZoneId?: string | null;
  acceptedDropTypes?: string[];

  calculateDropTarget?: (
    e: React.DragEvent,
    containerRef: HTMLElement | null
  ) => number | undefined;
}