import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { AudioFile, AudioItemActions } from "../types.js";
import ItemActions from "./ItemActions.js";
import { useItemDragDrop } from '../hooks/useItemDragDrop.js';
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import "./MacroEditView.css"; 

interface MacroEditViewProps extends AudioItemActions, DragDropProps {
  // Data props
  items: AudioFile[];
  collectionType: "macro";

  // UI state props
  selectedItemIds?: number[];
  showPlayButton?: boolean;
  showActions?: boolean | null;

  // Event handlers
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
}

// Debounce function to limit API calls
const useDebounce = (callback: Function, delay: number) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: any[]) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        callback(...args);
        timerRef.current = null;
      }, delay);
    },
    [callback, delay]
  );
};

export const MacroEditView: React.FC<MacroEditViewProps> = ({
  items,
  selectedItemIds = [],
  onEditItem,
  onRemoveItems,
  onAddItems,
  onItemSelect,
  // Add drag and drop props with defaults
}) => {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [debouncedSortedItems, setDebouncedSortedItems] = useState<AudioFile[]>([]);
  const acceptedDropTypes = useMemo(() => ["file"], []);

  const [editedValues, setEditedValues] = useState<
    Record<number, { 
      delay: number; 
      volume: number;
      isSaving?: boolean;
      lastSaved?: number;
    }>
  >({});
    
  const { 
    dropAreaProps,
    dragItemProps,
    isInsertionPoint,
  } = useItemDragDrop({
    items: debouncedSortedItems, 
    selectedItemIds,
    contentType: 'file',
    isDragSource: false,
    isReorderable: false, 
    isDropTarget: true,  
    dropZoneId: DROP_ZONES.SOUND_MANAGER_CONTENT,
    acceptedDropTypes,  
    containerRef: tableRef, 
    onAddItems,
  });

  // State to hold the sorted items with debouncing
  

  // Process any initial values from items
  useEffect(() => {
    const initialValues = items.reduce((acc, item) => {
      if (item.delay !== undefined || item.volume !== undefined) {
        acc[item.id] = {
          delay: item.delay || 0,
          volume: item.volume !== undefined ? item.volume : 1.0,
          lastSaved: Date.now(),
        };
      }
      
      return acc;
    }, {} as Record<number, any>);

    if (Object.keys(initialValues).length > 0) {
      setEditedValues(prev => ({
        ...prev,
        ...initialValues
      }));
    }

  }, [items]);

  // Debounced save function
  const debouncedSave = useDebounce(async (itemId: number, values: { delay: number, volume: number }) => {
    if (!onEditItem) return;

    try {
      // Mark as saving
      setEditedValues(prev => ({
        ...prev,
        [itemId]: { 
          ...prev[itemId],
          isSaving: true 
        }
      }));

      // Use the API to update the item
      await onEditItem(
        itemId,
        {volume: values.volume, delay: values.delay},
      );

      // Update state to reflect saved status
      setEditedValues(prev => ({
        ...prev,
        [itemId]: { 
          ...prev[itemId],
          isSaving: false,
          lastSaved: Date.now()
        }
      }));
    } catch (error) {
      console.error("Failed to update macro parameters:", error);
      // Keep the changes in the UI but mark as not saving
      setEditedValues(prev => ({
        ...prev,
        [itemId]: { 
          ...prev[itemId],
          isSaving: false
        }
      }));
    }
  }, 800); // 800ms debounce time

  // Debounced sorting by delay function 
  const debouncedSort = useDebounce(() => {
    const sorted = [...items].sort((a, b) => {
      const aDelay = editedValues[a.id]?.delay ?? a.delay ?? 0;
      const bDelay = editedValues[b.id]?.delay ?? b.delay ?? 0;
      return aDelay - bDelay;
    });
    setDebouncedSortedItems(sorted);
  }, 500); // 500ms debounce time for sorting

  // Update sorted items whenever source data changes
  useEffect(() => {
    // Initial sort only when items change or on mount
    if (debouncedSortedItems.length === 0 || 
        debouncedSortedItems.length !== items.length ||
        !items.every((item, i) => debouncedSortedItems[i]?.id === item.id)) {
      setDebouncedSortedItems([...items]);
    }
    // Only trigger debounced sort when editedValues change
    if (Object.keys(editedValues).length > 0) {
      debouncedSort();
    }
  }, [items, editedValues, debouncedSort]);

  // Update local state when delay or volume changes
  const handleValueChange = (
    itemId: number,
    field: "delay" | "volume",
    value: number
  ) => {
    // Optimistically update UI immediately
    setEditedValues(prev => {
      const newValues = {
        ...prev[itemId] || { delay: 0, volume: 1.0 },
        [field]: value,
      };
      
      // Trigger debounced save
      debouncedSave(itemId, {
        delay: newValues.delay,
        volume: newValues.volume
      });
      
      return {
        ...prev,
        [itemId]: newValues
      };
    });
  };

  // Handle increment and decrement of delay value
  const handleDelayAdjust = (itemId: number, adjustment: number) => {
    setEditedValues(prev => {
      const currentDelay = prev[itemId]?.delay || 0;
      const newDelay = Math.max(0, currentDelay + adjustment); // Ensure delay doesn't go below 0
      
      const newValues = {
        ...prev[itemId] || { delay: 0, volume: 1.0 },
        delay: newDelay,
      };
      
      debouncedSave(itemId, {
        delay: newDelay,
        volume: newValues.volume
      });
      
      return {
        ...prev,
        [itemId]: newValues
      };
    });
  };

  const handleItemSelection = (e: React.MouseEvent, itemId: number) => {
    if (!onItemSelect) return;

    // Only select if multi-select
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      onItemSelect?.(e, itemId);
    }
  };

  return (
    <div className="macro-edit-view" {...dropAreaProps}>
      <table ref={tableRef} className="audio-item-table macro-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Delay (ms)</th>
            <th>Volume</th>
            <th className="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          {/* Insert marker for the first position */}
          {isInsertionPoint(0) && (
            <tr className="insert-marker">
              <td colSpan={4}></td>
            </tr>
          )}

          {debouncedSortedItems.map((item, index) => {
            const itemEditValues = editedValues[item.id] || {
              delay: item.delay || 0,
              volume: item.volume !== undefined ? item.volume : 1.0,
            };

            const isSaving = itemEditValues.isSaving;

            return (
              <React.Fragment key={item.id}>
                <tr
                  {...(() => {
                    const dragProps = dragItemProps(item);
                    const combinedClassName = `audio-item-row macro ${
                      selectedItemIds.includes(item.id) ? "selected" : ""
                    } ${isSaving ? "saving" : ""} ${dragProps.className || ""}`.trim();
                    return { ...dragProps, className: combinedClassName };
                  })()}
                  onClick={(e) => handleItemSelection(e, item.id)}
                  aria-selected={selectedItemIds.includes(item.id)}
                  data-item-id={item.id}
                >
                  <td>
                    <div className="item-name-cell">{item.name}</div>
                  </td>
                  {/* Rest of the cells remain unchanged */}
                  <td>
                    <div className="parameter-control">
                      <input
                        title="delay-input"
                        type="number"
                        value={itemEditValues.delay}
                        onChange={(e) =>
                          handleValueChange(
                            item.id,
                            "delay",
                            parseInt(e.target.value || "0")
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="delay-input"
                        min="0"
                        step="100"
                      />
                      <div className="delay-spinner">
                        <button 
                          className="spinner-btn spinner-up" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelayAdjust(item.id, 100);
                          }}
                          tabIndex={-1}
                        >+</button>
                        <button 
                          className="spinner-btn spinner-down" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelayAdjust(item.id, -100);
                          }}
                          tabIndex={-1}
                        >-</button>
                      </div>
                      <span className="parameter-unit">ms</span>
                      {isSaving && <span className="save-indicator">●</span>}
                    </div>
                  </td>
                  <td>
                    <div className="parameter-control">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={itemEditValues.volume}
                        onChange={(e) =>
                          handleValueChange(
                            item.id,
                            "volume",
                            parseFloat(e.target.value)
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="volume-slider"
                      />
                      <span className="volume-value">
                        {Math.round(itemEditValues.volume * 100)}%
                      </span>
                    </div>
                  </td>
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className="macro-actions"
                  >
                    <ItemActions
                      item={item}
                      selectedItemIds={selectedItemIds}
                      onRemoveItems={onRemoveItems}
                      isSmall
                    />
                  </td>
                </tr>

                {/* Insert marker after this row */}
                {isInsertionPoint(index + 1) && (
                  <tr className="insert-marker">
                    <td colSpan={4}></td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MacroEditView;
