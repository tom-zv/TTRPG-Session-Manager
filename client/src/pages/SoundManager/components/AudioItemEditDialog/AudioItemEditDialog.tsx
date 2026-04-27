// AudioItemEditDialog.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
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
import styles from "./AudioItemEditDialog.module.css";
import { EditableField } from "src/components/FormControls/index.js";

//TODO: folderTree edit sync - folder tree doesnt use react query, causing desync
interface AudioItemEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEditClick?: (itemId: number) => void;
  item: AudioItem;
  parentCollectionId: number;
  parentCollectionType: string;
}

type AudioItemFormData = Record<string, string | undefined>;

type AudioItemFormDraft = {
  key: string;
  formData: AudioItemFormData;
  dirtyFields: Set<string>;
};

const EMPTY_DIRTY_FIELDS = new Set<string>();

const getAudioItemFormKey = (
  item: AudioItem,
  parentCollectionId: number,
  parentCollectionType: string
) => `${parentCollectionType}:${parentCollectionId}:${item.type}:${item.id}`;

const buildInitialFormData = (item: AudioItem): AudioItemFormData => {
  const initial: AudioItemFormData = { name: item.name };
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
  return initial;
};

const AudioItemEditDialog: React.FC<AudioItemEditDialogProps> = ({
  isOpen,
  onClose,
  item,
  parentCollectionType,
  parentCollectionId,
}) => {
  const initialFormData = useMemo(() => buildInitialFormData(item), [item]);
  const formKey = useMemo(
    () => getAudioItemFormKey(item, parentCollectionId, parentCollectionType),
    [item, parentCollectionId, parentCollectionType]
  );
  const [formDraft, setFormDraft] = useState<AudioItemFormDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dialogContentRef = useRef<HTMLDivElement>(null);

  const activeDraft = formDraft?.key === formKey ? formDraft : null;
  const formData = activeDraft?.formData ?? initialFormData;
  const dirtyFields = activeDraft?.dirtyFields ?? EMPTY_DIRTY_FIELDS;

  const handleClose = useCallback(() => {
    setFormDraft(null);
    setError(null);
    onClose();
  }, [onClose]);

  const handleFieldChange = (name: string, value: string) => {
    setFormDraft((currentDraft) => {
      const baseDraft =
        currentDraft?.key === formKey
          ? currentDraft
          : {
              key: formKey,
              formData: initialFormData,
              dirtyFields: EMPTY_DIRTY_FIELDS,
            };
      const nextDirtyFields = new Set(baseDraft.dirtyFields);
      nextDirtyFields.add(name);
      return {
        key: formKey,
        formData: { ...baseDraft.formData, [name]: value },
        dirtyFields: nextDirtyFields,
      };
    });
  };

  const updateCollection = useUpdateCollection(parentCollectionType as CollectionType);
  const updateAudioFile = useUpdateCollectionFile(parentCollectionType as CollectionType);

  const handleSave = async () => {
    try {
      setError(null);
      
      // Build payload based on dirty fields
      const payload: Record<string, string | number | boolean | {type: CollectionType, id: number} | undefined> = { id: item.id, collectionId: parentCollectionId };
      
      // Only include fields that were edited
      Array.from(dirtyFields).forEach(field => {
        payload[field] = formData[field];
      });

      // Submit based on item type
      if (isAudioCollection(item)) {
        updateCollection.mutate(payload as { id: number; name?: string; description?: string; imageUrl?: string });
      } else if (isAudioFile(item)) {
        updateAudioFile.mutate(payload as { id: number; collectionId: number; name?: string; path?: string; url?: string; active?: boolean; volume?: number; delay?: number; parentInfo?: {type: CollectionType, id: number} });
      }
      
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const getTitle = () => {
    if (isAudioFile(item)) return "Edit Audio File";
    if (isAudioMacro(item)) return "Edit Macro";
    if (isAudioCollection(item)) {
      switch (item.audioType) {
        case "playlist":
          return "Edit Playlist";
        case "sfx":
          return "Edit SFX Collection";
        case "ambience":
          return "Edit Ambience Collection";
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
      onClose={handleClose}
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
        <div className={styles.audioItemEditForm}>
          {error && <div className="alert alert-danger">{error}</div>}

          <EditableField
            label="Name"
            value={formData.name || ""}
            onChange={(v) => handleFieldChange("name", v)}
          />

          {isAudioCollection(item) && (
            <EditableField
              label="Description"
              value={formData.description || ""}
              onChange={(v) => handleFieldChange("description", v)}
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
                  type="url"
                  value={formData.url || ""}
                  onChange={(v) => handleFieldChange("url", v)}
                />

                <EditableField
                  label="File path (Relative)"
                  value={formData.path || ""}
                  onChange={(v) => handleFieldChange("path", v)}
                />
              </div>
            </>
          )}

          {isPlaylistCollection(item) && (
            <EditableField
              label="Image Path"
              value={formData.imageUrl || ""}
              onChange={(v) => handleFieldChange("imageUrl", v)}
            />
          )}

          <div className="form-actions">
            <button className="btn btn-muted" onClick={handleClose}>
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
