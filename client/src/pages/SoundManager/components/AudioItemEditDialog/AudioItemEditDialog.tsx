// AudioItemEditDialog.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useUpdateCollection } from "../../api/collections/useCollectionBaseMutations.js";
import { useUpdateFile } from "../../api/collections/useCollectionItemMutations.js";
import Dialog from "../../../../components/Dialog/Dialog.js";
import MacroEditView from "../CollectionItemsDisplay/components/MacroEditView.js";
import { CollectionType } from "../../types/index.js";
import {
  AudioItem,
  AudioMacro,
  isAudioFile,
  isAudioCollection,
  isAudioMacro,
} from "../../types/AudioItem.js";
import "./AudioItemEditDialog.css";
import EditableField from "../../../../components/EditableField/EditableField.js";

interface AudioItemEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEditClick: (itemId: number) => void;
  item: AudioItem;
  parentCollectionId: number;
  parentCollectionType: string;
}

const AudioItemEditDialog: React.FC<AudioItemEditDialogProps> = ({
  isOpen,
  onClose,
  onEditClick,
  item,
  parentCollectionType,
  parentCollectionId,
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const dirtyFields = useRef<Set<string>>(new Set());
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!item) return;
    dirtyFields.current.clear();
    const initial: Record<string, any> = { name: item.name };
    if (isAudioFile(item)) {
      initial.fileUrl = item.fileUrl;
      initial.filePath = item.filePath;
    }
    if (isAudioCollection(item)) {
      initial.description = item.description;
    }
    setFormData(initial);
  }, [item, parentCollectionType]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    dirtyFields.current.add(name);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const updateCollection = useUpdateCollection(parentCollectionType as CollectionType);
  const updateAudioFile = useUpdateFile(parentCollectionType as CollectionType);

  const handleSave = async () => {
    try {
      setError(null);
      
      // Build payload based on dirty fields
      const payload: Record<string, any> = { id: item.id, collectionId: parentCollectionId };
      
      // Only include fields that were edited
      Array.from(dirtyFields.current).forEach(field => {
        payload[field] = formData[field];
      });
      
      // Submit based on item type
      if (isAudioCollection(item)) {
        updateCollection.mutate(payload as { id: number; name?: string; description?: string });
      } else if (isAudioFile(item)) {
        updateAudioFile.mutate(payload as { id: number; collectionId: number; name?: string; filePath?: string; fileUrl?: string; active?: boolean; volume?: number; delay?: number; parentInfo?: any });
      }
      
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const getTitle = () => {
    if (isAudioFile(item)) return "Edit Audio File";
    if (isAudioMacro(item)) return "Edit Macro";
    if (isAudioCollection(item)) {
      switch (item.type) {
        case "playlist":
          return "Edit Playlist";
        case "sfx":
          return "Edit SFX Collection";
        case "ambience":
          return "Edit Ambience Collection";
        case "pack":
          return "Edit Pack";
        default:
          return "Edit Collection";
      }
    }
    return "Edit Item";
  };

  const showMacroEditor = isAudioMacro(item);

  const parentInfo = useMemo(
    () => ({
      type: parentCollectionType as CollectionType,
      id: parentCollectionId,
    }),
    [parentCollectionType, parentCollectionId]
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      contentRef={dialogContentRef}
      sidePanel={item.type === "macro"}
      className="modern-dialog"
    >
      {showMacroEditor ? (
        <MacroEditView
          macro={item as AudioMacro}
          parentCollectionInfo={parentInfo}
          onEditClick={onEditClick}
          dialogContentRef={dialogContentRef}
        />
      ) : (
        <div className="audio-item-edit-form">
          {error && <div className="error-message">{error}</div>}

          <EditableField
            label="Name"
            name="name"
            value={formData.name || ""}
            onChange={handleChange}
          />

          {isAudioCollection(item) && (
            <EditableField
              label="Description"
              name="description"
              value={formData.description || ""}
              onChange={handleChange}
              multiline
              rows={3}
            />
          )}

          {isAudioFile(item) && (
            <>
              <div className="form-section">
                <h4 className="section-title">Audio Source</h4>

                <EditableField
                  label="File URL"
                  name="fileUrl"
                  type="url"
                  value={formData.fileUrl || ""}
                  onChange={handleChange}
                />

                <EditableField
                  label="File path (Relative)"
                  name="filePath"
                  value={formData.filePath || ""}
                  onChange={handleChange}
                />
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button button-primary" onClick={handleSave}>
              Save Changes
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default AudioItemEditDialog;
