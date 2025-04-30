// MacroEditView.tsx
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { AudioFile, AudioMacro, isAudioFile } from "../../../types/AudioItem.js";
import { CollectionType } from "../index.js";
import ItemActions from "./ItemActions.js";
import { useItemDragDrop } from "../hooks/useItemDragDrop.js";
import { useCollectionMutations } from "../hooks/useCollectionActions.js";
import { useUpdateMacroFile } from "../../../api/collections/useSfxMutations.js";
import { useSelection } from "src/hooks/useSelection.js";
import { useDebounce } from "src/hooks/useDebounce.js";
import "./MacroEditView.css";

interface MacroEditViewProps {
  macro: AudioMacro;
  parentCollectionInfo: { type: CollectionType; id: number };
  onEditClick?: (itemId: number) => void;
  dialogContentRef?: React.RefObject<HTMLDivElement>;
}

type DropAreaProps = Partial<
  Pick<
    React.HTMLAttributes<HTMLDivElement>,
    "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop" | "className"
  >
>;

export const MacroEditView: React.FC<MacroEditViewProps> = ({
  macro,
  parentCollectionInfo,
  onEditClick,
  dialogContentRef,
}) => {
  // Prepare files
  const items = useMemo(
    () => (macro.items || []).filter(isAudioFile) as AudioFile[],
    [macro.items]
  );

  // Immediate sort on mount
  const [sortedItems, setSortedItems] = useState<AudioFile[]>(() =>
    [...items].sort((a, b) => {
      const aD = a.delay ?? 0;
      const bD = b.delay ?? 0;
      return aD - bD;
    })
  );

  const tableRef = useRef<HTMLTableElement>(null);

  const { selectedItems, handleSelect, clearSelection, isSelected } =
    useSelection<AudioFile>({
      getItemId: (i) => i.id,
      allowMultiSelect: true,
    });
  const selectedItemIds = useMemo(
    () => selectedItems.map((i) => i.id),
    [selectedItems]
  );

  const { addItemsMutation, removeItemsMutation } = useCollectionMutations(
    macro.id,
    "macro",
    { onRemoveSuccess: clearSelection },
    parentCollectionInfo
  );

  // Edited values
  type Edited = { delay: number; volume: number; isSaving?: boolean; lastSaved?: number };
  const [editedValues, setEditedValues] = useState<Record<number, Edited>>({});

  // initialize on items change
  useEffect(() => {
    const initial: Record<number, Edited> = {};
    items.forEach((item) => {
      initial[item.id] = {
        delay: item.delay || 0,
        volume: item.volume ?? 1.0,
        isSaving: false,
        lastSaved: Date.now(),
      };
    });
    setEditedValues((prev) => ({ ...initial, ...prev }));
  }, [items]);

  // Drag-drop
  const { dropAreaProps, dragItemProps, isInsertionPoint } = useItemDragDrop({
    items: sortedItems,
    selectedItemIds,
    contentType: "file",
    isDragSource: false,
    isReorderable: false,
    isDropTarget: true,
    acceptedDropTypes: ["file"],
    containerRef: tableRef,
    useAddItems: addItemsMutation,
  });

  useEffect(() => {
    const el = dialogContentRef?.current;
    if (!el) return;
    const { onDragEnter, onDragOver, onDragLeave, onDrop, className } =
      dropAreaProps as DropAreaProps;

    const listeners: Array<{ event: keyof HTMLElementEventMap; handler: (e: Event) => void }> = [];

    if (onDragEnter) {
      const handler = (e: Event) =>
        onDragEnter(e as unknown as React.DragEvent<HTMLDivElement>);
      el.addEventListener("dragenter", handler);
      listeners.push({ event: "dragenter", handler });
    }
    if (onDragOver) {
      const handler = (e: Event) =>
        onDragOver(e as unknown as React.DragEvent<HTMLDivElement>);
      el.addEventListener("dragover", handler);
      listeners.push({ event: "dragover", handler });
    }
    if (onDragLeave) {
      const handler = (e: Event) =>
        onDragLeave(e as unknown as React.DragEvent<HTMLDivElement>);
      el.addEventListener("dragleave", handler);
      listeners.push({ event: "dragleave", handler });
    }
    if (onDrop) {
      const handler = (e: Event) =>
        onDrop(e as unknown as React.DragEvent<HTMLDivElement>);
      el.addEventListener("drop", handler);
      listeners.push({ event: "drop", handler });
    }

    if (className?.split(" ").includes("drop-target")) {
      el.classList.add("drop-target");
    } else {
      el.classList.remove("drop-target");
    }

    return () => {
      listeners.forEach(({ event, handler }) => el.removeEventListener(event, handler));
      el.classList.remove("drop-target");
    };
  }, [dropAreaProps, dialogContentRef]);

  // Debounced save 
  const updateMacroFile = useUpdateMacroFile();
  const itemsPendingSave = useRef(new Set<number>());
  
  const saveItem = useCallback(() => {
    // Nothing to save
    if (itemsPendingSave.current.size === 0) return;
    
    // Process each pending item
    const pendingIds = Array.from(itemsPendingSave.current);
    
    setEditedValues(currentEditedValues => {
      // For each item in the queue
      pendingIds.forEach(id => {
        const currentValues = currentEditedValues[id];
        if (!currentValues) return;
        
        // Mark as saving
        currentEditedValues = {
          ...currentEditedValues,
          [id]: { ...currentValues, isSaving: true }
        };
        
        // Make the API call with the current values
        updateMacroFile.mutate(
          {
            macroId: macro.id,
            fileId: id,
            volume: currentValues.volume,
            delay: currentValues.delay,
            parentInfo: parentCollectionInfo,
          },
          {
            onSuccess: () => {
              // Remove from the pending queue on success
              itemsPendingSave.current.delete(id);
              
              // Update the isSaving flag
              setEditedValues(latest => ({
                ...latest,
                [id]: { ...latest[id], isSaving: false }
              }));
            },
            onError: () => {
              // Remove from the pending queue on error too
              itemsPendingSave.current.delete(id);
              
              // Update the isSaving flag
              setEditedValues(latest => ({
                ...latest,
                [id]: { ...latest[id], isSaving: false }
              }));
            },
          }
        );
      });
      
      return currentEditedValues;
    });
  }, [macro.id, updateMacroFile, parentCollectionInfo]);
  
  const debouncedSave = useDebounce(saveItem, 800);

  // Debounced resort
  const doSort = useCallback(() => {
    setSortedItems(
      [...items].sort((a, b) => {
        const aD = editedValues[a.id]?.delay ?? a.delay ?? 0;
        const bD = editedValues[b.id]?.delay ?? b.delay ?? 0;
        return aD - bD;
      })
    );
  }, [items, editedValues]);

  const debouncedSort = useDebounce(doSort, 800);

  useEffect(() => {
    debouncedSort();
  }, [editedValues, debouncedSort]);

  // Handlers
  const handleValueChange = (
    itemId: number,
    field: "delay" | "volume",
    value: number
  ) => {
    // Track which items have pending saves
    itemsPendingSave.current.add(itemId);
    
    // Update local state immediately
    setEditedValues((prev) => {
      const base = prev[itemId] || { delay: 0, volume: 1.0, isSaving: false };
      const next = { ...base, [field]: value };
      return { ...prev, [itemId]: next };
    });
    
    // Trigger debounced save without parameters
    debouncedSave();
  };

  const handleDelayAdjust = (itemId: number, delta: number) => {
    // Track which items have pending saves
    itemsPendingSave.current.add(itemId);
    
    // Update local state immediately
    setEditedValues((prev) => {
      const base = prev[itemId] || { delay: 0, volume: 1.0, isSaving: false };
      const next = { ...base, delay: Math.max(0, base.delay + delta) };
      return { ...prev, [itemId]: next };
    });
    
    // Trigger debounced save without parameters
    debouncedSave();
  };

  const handleRowClick = (e: React.MouseEvent, item: AudioFile) => {
    handleSelect(item, items, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  // Render
  return (
    <div className="macro-edit-view">
      {items.length === 0 ? (
        <div className="empty-macro-message">
          Drag and drop audio files here to add them to the macro.
        </div>
      ) : (
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
            {isInsertionPoint(0) && (
              <tr className="insert-marker">
                <td colSpan={4} />
              </tr>
            )}

            {sortedItems.map((item, idx) => {
              // Fallback if editedValues isn't yet initialized
              const vals =
                editedValues[item.id] || {
                  delay: item.delay || 0,
                  volume: item.volume ?? 1.0,
                  isSaving: false,
                };
              return (
                <React.Fragment key={item.id}>
                  <tr
                    {...dragItemProps(item)}
                    className={[
                      "audio-item-row",
                      "macro",
                      isSelected(item) ? "selected" : "",
                      vals.isSaving ? "saving" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    draggable={false}
                    onClick={(e) => handleRowClick(e, item)}
                    aria-selected={isSelected(item)}
                  >
                    <td>
                      <div className="item-name-cell">{item.name}</div>
                    </td>
                    <td>
                      <div className="parameter-control">
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={vals.delay}
                          onChange={(e) =>
                            handleValueChange(item.id, "delay", +e.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="delay-input"
                        />
                        <div className="delay-buttons">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelayAdjust(item.id, 100);
                            }}                           
                          >
                            +
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelayAdjust(item.id, -100);
                            }}                            
                          >
                            –
                          </button>
                        </div>
                        <span className="parameter-unit">ms</span>
                        {vals.isSaving && (
                          <span className="save-indicator" title="Saving…">
                            ●
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="parameter-control">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={vals.volume}
                          onChange={(e) =>
                            handleValueChange(item.id, "volume", +e.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="volume-slider"
                        />
                        <span className="volume-value">
                          {Math.round(vals.volume * 100)}%
                        </span>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="macro-actions">
                      <ItemActions
                        collectionId={macro.id}
                        item={item}
                        selectedItems={selectedItems}
                        useRemoveItems={removeItemsMutation}
                        onEditClick={onEditClick}
                        isSmall
                      />
                    </td>
                  </tr>

                  {isInsertionPoint(idx + 1) && (
                    <tr className="insert-marker">
                      <td colSpan={4} />
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MacroEditView;
