// dragDropUtils.ts
import { DragEvent } from 'react';

/**
 * Prevent default behavior and set the drop effect to "copy".
 */
export function allowDropEffect(e: DragEvent) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

/**
 * Returns a placeholder drag count (e.g. 1 if JSON data is present, otherwise 0).
 */
export function getDragCountFromEvent(e: DragEvent): number {
  try {
    const items = e.dataTransfer.items;
    if (items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'application/json') {
          return 1; // JSON data detected
        }
      }
    }
  } catch (err) {
    console.log('Could not read drag data type', err);
  }
  return 0;
}

/**
 * Process a drop event: parse data, validate content type, optionally transform items, and invoke the drop handler.
 */
interface DropOptions<T = any, D = any> {
  transformItems?: (sourceItems: any[]) => T[];
  destination?: D;
  onError?: (error: Error) => void;
  zoneId?: string;
}

export async function processDropEvent<T, D = any>(
  e: DragEvent,
  acceptedTypes: string[],
  dropHandler: (items: T[], destination?: D) => Promise<void>,
  options: DropOptions<T, D> = {}
): Promise<void> {
  e.preventDefault();
  try {
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    const payload = JSON.parse(data);
    if (!acceptedTypes.includes(payload.contentType)) {
      return;
    }
    if (payload.items && payload.items.length > 0) {
      const finalItems: T[] = options.transformItems
        ? options.transformItems(payload.items)
        : payload.items;
      console.log('dropped items:', finalItems);
      await dropHandler(finalItems, options.destination);
    }
  } catch (error) {
    if (options.zoneId) {
      console.error(`Error in drop zone ${options.zoneId}:`, error);
    } else {
      console.error('Error processing dropped item(s):', error);
    }
    if (options.onError && error instanceof Error) {
      options.onError(error);
    }
  }
}

/**
 * Type defining the complete set of drop event handlers.
 */
export interface DropHandlers {
  onDragOver: (e: DragEvent) => void;
  onDragEnter: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => Promise<void>;
}

/**
 * Factory function that returns the full set of drop event handlers.
 * Optionally accepts an "updateDragState" callback to update local state.
 */
export function createDropHandlers<T, D = any>(
  acceptedTypes: string[],
  dropHandler: (items: T[], destination?: D) => Promise<void>,
  options: DropOptions<T, D> = {},
  updateDragState?: (isDraggingOver: boolean, dragCount: number) => void
): DropHandlers {
  return {
    onDragOver: (e) => {
      allowDropEffect(e);
    },
    onDragEnter: (e) => {
      e.preventDefault();
      if (updateDragState) {
        updateDragState(true, getDragCountFromEvent(e));
      }
    },
    onDragLeave: (e) => {
      e.preventDefault();
      if (updateDragState) {
        updateDragState(false, 0);
      }
    },
    onDrop: async (e) => {
      e.preventDefault();
      if (updateDragState) {
        updateDragState(false, 0);
      }
      await processDropEvent<T, D>(e, acceptedTypes, dropHandler, options);
    }
  };
}
