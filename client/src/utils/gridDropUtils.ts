import { DragEvent } from 'react';

/**
 * Calculate the appropriate drop index for a grid based on mouse position
 * 
 * @param e - The drag event
 * @param gridElement - The grid container element reference
 * @returns The calculated drop index, or undefined if unable to calculate
 */
export function calculateGridDropIndex(
  e: DragEvent,
  gridElement: HTMLElement | null
): number | undefined {
  if (!gridElement) return undefined;
  
  // Get all grid items (cards)
  const items = Array.from(gridElement.querySelectorAll('.audio-item-card:not(.insert-marker)'));
  if (items.length === 0) return 0; // If no items, drop at start
  
  const mouseX = e.clientX;
  const mouseY = e.clientY;
  
  // If mouse is above all items, insert at beginning
  const firstItemRect = items[0].getBoundingClientRect();
  if (mouseY < firstItemRect.top) {
    return 0;
  }
  
  // If mouse is below all items, insert at end
  const lastItemRect = items[items.length - 1].getBoundingClientRect();
  if (mouseY > lastItemRect.bottom) {
    return items.length;
  }
  
  // Find the row where the mouse is positioned
  const rows: HTMLElement[][] = [];
  let currentRowTop: number | null = null;
  let currentRow: HTMLElement[] = [];
  
  // Group items into rows based on their vertical position
  items.forEach((item) => {
    const rect = item.getBoundingClientRect();
    
    // If this is the first item or it's on a new row
    if (currentRowTop === null || Math.abs(rect.top - currentRowTop) > 10) {
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRowTop = rect.top;
      currentRow = [item as HTMLElement];
    } else {
      currentRow.push(item as HTMLElement);
    }
  });
  
  // Add the last row
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  
  // Find the row that contains the mouse position
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const firstItemInRow = row[0];
    const lastItemInRow = row[row.length - 1];
    
    const rowTop = firstItemInRow.getBoundingClientRect().top;
    const rowBottom = firstItemInRow.getBoundingClientRect().bottom;
    
    // Check if mouse is within this row's vertical bounds
    if (mouseY >= rowTop && mouseY <= rowBottom) {
      // Mouse is within this row - find the nearest item horizontally
      for (let i = 0; i < row.length; i++) {
        const item = row[i];
        const rect = item.getBoundingClientRect();
        
        // If mouse is to the left of the item's midpoint, insert before
        if (mouseX < rect.left + rect.width / 2) {
          // Calculate the absolute index in the items array
          return items.indexOf(item);
        }
      }
      
      // If we get here, the mouse is to the right of all items in this row
      const lastItem = row[row.length - 1];
      return items.indexOf(lastItem) + 1;
    }
    
    // Check if mouse is between this row and the next row
    if (rowIndex < rows.length - 1) {
      const nextRowTop = rows[rowIndex + 1][0].getBoundingClientRect().top;
      
      if (mouseY > rowBottom && mouseY < nextRowTop) {
        // Mouse is between rows - insert at the end of the current row
        return items.indexOf(lastItemInRow) + 1;
      }
    }
  }
  
  // Fallback - should not reach here with the above logic
  return items.length;
}

/**
 * Determines if the mouse is positioned over a grid card and returns its index
 * Only returns a value when directly over a card, not between cards
 * 
 * @param e - The drag event
 * @param element - The grid container element reference
 * @returns The index of the card under the mouse, or undefined if not over any card
 */
export function calculateCardDropTarget(
  e: DragEvent,
  element: HTMLElement | null
): number | undefined {
  if (!element) return undefined;
  
  const gridElement = element;
  
  const mouseX = e.clientX;
  const mouseY = e.clientY;
  
  // Get all grid items (cards)
  const items = Array.from(gridElement.querySelectorAll('.audio-item-card:not(.insert-marker)'));
  if (items.length === 0) return undefined; // No cards to drop onto
  
  // Check if mouse is over any card
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as HTMLElement;
    const rect = item.getBoundingClientRect();
    
    // Check if mouse coordinates are within this card's boundaries
    if (
      mouseX >= rect.left && 
      mouseX <= rect.right &&
      mouseY >= rect.top && 
      mouseY <= rect.bottom
    ) {
      // Mouse is inside this card
      return i+1; // Return index (1-based for insertion)
    }
  }
  
  // Mouse is not over any card
  return undefined;
}