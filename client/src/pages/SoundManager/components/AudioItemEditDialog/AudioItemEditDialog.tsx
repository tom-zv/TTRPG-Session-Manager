// AudioItemEditDialog.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useUpdateCollection } from "../../api/collections/mutations/useCollectionBaseMutations.js";
import { useUpdateCollectionFile } from "../../api/collections/mutations/useCollectionItemMutations.js";
import Dialog from "../../../../components/Dialog/Dialog.js";
import MacroEditView from "../CollectionItemsDisplay/components/MacroEditView.js";
import { CollectionType } from "shared/audio/types.js";
import {
  AudioItem,
  AudioMacro,
  isAudioFile,
  isAudioCollection,
  isAudioMacro,
  isPlaylistCollection,
  AudioCollection
} from "../../types/AudioItem.js";
import "./AudioItemEditDialog.css";
import EditableField from "../../../../components/EditableField/EditableField.js";

//TODO: folderTree edit sync - folder tree doesnt use react query, causing desync
interface AudioItemEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEditClick?: (itemId: number) => void;
  item: AudioItem;
  parentCollectionId: number;
  parentCollectionType: string;
}

const AudioItemEditDialog: React.FC<AudioItemEditDialogProps> = ({
  isOpen,
  onClose,
  item,
  parentCollectionType,
  parentCollectionId,
}) => {
  const [formData, setFormData] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  const dirtyFields = useRef<Set<string>>(new Set());
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!item) return;
    dirtyFields.current.clear();
    const initial: Record<string, string | undefined> = { name: item.name };
    if (isAudioFile(item)) {
      initial.url = item.url;
      initial.path = item.path;
    }
    if (isAudioCollection(item)) {
      initial.description = item.description;
    }
    if (isPlaylistCollection(item)) {
      initial.imageUrl = (item as AudioCollection).imageUrl || "";
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
  const updateAudioFile = useUpdateCollectionFile(parentCollectionType as CollectionType);

  const handleSave = async () => {
    try {
      setError(null);
      
      // Build payload based on dirty fields
      const payload: Record<string, string | number | boolean | {type: CollectionType, id: number} | undefined> = { id: item.id, collectionId: parentCollectionId };
      
      // Only include fields that were edited
      Array.from(dirtyFields.current).forEach(field => {
        payload[field] = formData[field];
      });

      // Submit based on item type
      if (isAudioCollection(item)) {
        updateCollection.mutate(payload as { id: number; name?: string; description?: string; imageUrl?: string });
      } else if (isAudioFile(item)) {
        updateAudioFile.mutate(payload as { id: number; collectionId: number; name?: string; path?: string; url?: string; active?: boolean; volume?: number; delay?: number; parentInfo?: {type: CollectionType, id: number} });
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
      noOverlay={item.type === "macro"}
      className="modern-dialog"
    >
      {showMacroEditor ? (
        <MacroEditView
          macro={item as AudioMacro}
          parentCollectionInfo={parentInfo}
          dialogContentRef={dialogContentRef}
        />
      ) : (
        <div className="audio-item-edit-form">
          {error && <div className="alert alert-danger">{error}</div>}

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
                  value={formData.url || ""}
                  onChange={handleChange}
                />

                <EditableField
                  label="File path (Relative)"
                  name="path"
                  value={formData.path || ""}
                  onChange={handleChange}
                />
              </div>
            </>
          )}

          {isPlaylistCollection(item) && (
            <EditableField
              label="Image Path"
              name="imageUrl"
              value={formData.imageUrl || ""}
              onChange={handleChange}
            />
          )}

          <div className="form-actions">
            <button className="btn btn-muted" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              Save Changes
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default AudioItemEditDialog;
