import { DragEvent } from 'react';

/**
 * Calculate the appropriate drop index for a table based on mouse position
 * 
 * @param e - The drag event
 * @param tableElement - The table element reference
 * @returns The calculated drop index, or undefined if unable to calculate
 */
export function calculateTableDropIndex(
  e: DragEvent,
  tableElement: HTMLTableElement | null
): number | undefined {
  if (!tableElement) return undefined;
  
  const tbody = tableElement.querySelector('tbody');
  if (!tbody) return undefined;
  
  // Get only the actual data rows, excluding insert markers
  const rows = Array.from(tbody.querySelectorAll('tr:not(.insert-marker)'));
  if (rows.length === 0) return 0; // If no rows, drop at the start 
  
  const mouseY = e.clientY;
  
  // If mouse is above the first row, insert at beginning
  const firstRowRect = rows[0].getBoundingClientRect();
  if (mouseY < firstRowRect.top) {
    return 0;
  }
  
  // If mouse is below the last row, insert at end
  const lastRowRect = rows[rows.length - 1].getBoundingClientRect();
  if (mouseY > lastRowRect.bottom) {
    return rows.length ;
  }
  
  // Find the row where the mouse is positioned
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowRect = row.getBoundingClientRect();
    
    // If mouse is within this row's bounds
    if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
      const rowHeight = rowRect.height;
      
      // Consider the mouse in the top section only if it's significantly in the top portion
      // This makes the top section smaller to prevent toggle
      if (mouseY < rowRect.top + rowHeight * 0.4) {
        return i;
      } else {
        return i + 1;
      }
    }
    
    // Check if mouse is between this row and the next row
    if (i < rows.length - 1) {
      const nextRow = rows[i + 1];
      const nextRowRect = nextRow.getBoundingClientRect();
      
      if (mouseY > rowRect.bottom && mouseY < nextRowRect.top) {
        return i + 1; // Mouse is in between rows (shifted up by 1)
      }
    }
  }
  
  // Fallback - should not reach here with the above logic
  return rows.length;
}