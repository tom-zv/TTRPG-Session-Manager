// dragDropUtils.ts
import { DragEvent } from 'react';
import { dragMode } from 'src/hooks/useDragSource.js';

/**
 * Context object passed to drop handlers
 */
export interface DropContext<D = any> {
  destination?: D;
  index?: number;
  mode?: dragMode;
}

/**
 * Prevent default behavior and set the drop effect to "copy".
 */
export function allowDropEffect(e: DragEvent): void {
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
 * Type defining the complete set of drop event handlers.
 */
export interface DropHandlers {
  onDragOver: (e: DragEvent) => void;
  onDragEnter: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => Promise<void>;
}

/**
 * Provides current drop context values
 */
export interface DropContextGetter<D = any> {
  (): {
    destination?: D;
    index?: number;
  }
}

/**
 * Factory function that returns the full set of drop event handlers.
 */
export interface DropHandlerOptions<T, D = any> {
  acceptedTypes: string[];
  transformItems?: (sourceItems: any[]) => T[];
  onError?: (error: Error) => void;
  onItemsDropped: (items: T[], context: DropContext<D>) => Promise<void>;
}

export function createDropHandlers<T, D = any>(
  options: DropHandlerOptions<T, D>,
  updateDragState?: (isDragging: boolean, count: number) => void,
  getContext?: DropContextGetter<D>
): DropHandlers {
  const { acceptedTypes, onItemsDropped } = options;

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
      e.stopPropagation();
      // Get current context values from hook if provided
      const context = getContext ? getContext() : {};

      if (updateDragState) {
        updateDragState(false, 0);
      }
      
      await processDropEvent<T, D>(e, acceptedTypes, onItemsDropped, {
        ...options,
        ...context // Spread current destination and index
      });
    }
  };
}

/**
 * Process a drop event: parse data, validate content type, optionally transform items, and invoke the drop handler.
 */
interface DropOptions<T = any, D = any> {
  destination?: D;
  index?: number;
  zoneId?: string;
  transformItems?: (sourceItems: any[]) => T[];
  onError?: (error: Error) => void;
}

export async function processDropEvent<T, D = any>(
  e: DragEvent,
  acceptedTypes: string[],
  dropHandler: (items: T[], context: DropContext<D>) => Promise<void>,
  options: DropOptions<T, D> = {}
): Promise<void> {

  e.preventDefault();
  
  try {
    const data = e.dataTransfer.getData('application/json');
    if (!data) {
      console.log('No JSON data found in drop');
      return;
    }
    
    const payload = JSON.parse(data);
    //console.log('Drop payload:', payload);
    
    if (!acceptedTypes.includes(payload.contentType)) {
      console.log(`Content type: ${payload.contentType}, not in accepted types:`, acceptedTypes);
      return;
    }
    if (payload.items && payload.items.length > 0) {
      const finalItems: T[] = options.transformItems
        ? options.transformItems(payload.items)
        : payload.items;
      
      await dropHandler(finalItems, {
        destination: options.destination,
        index: options.index,
        mode: payload.mode
      });
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