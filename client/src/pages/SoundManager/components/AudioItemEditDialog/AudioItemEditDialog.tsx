// AudioItemEditDialog.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!item) return;
    const initial: Record<string, any> = { name: item.name };
    if (isAudioFile(item)) {
      initial.volume = item.volume;
      initial.fileUrl = item.fileUrl;
    }
    if (isAudioCollection(item)) {
      initial.description = item.description;
    }
    setFormData(initial);
  }, [item, parentCollectionType]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    let processed: any = value;
    if (type === "number" || name === "volume" || name === "delay") {
      processed =
        name === "volume"
          ? Math.min(1, Math.max(0, parseFloat(value) || 0))
          : parseFloat(value) || 0;
    }
    setFormData((prev) => ({ ...prev, [name]: processed }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      // TODO: Implement save API call
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
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

          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name || ""}
              onChange={handleChange}
              required
            />
          </div>

          {isAudioCollection(item) && (
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description || ""}
                onChange={handleChange}
                rows={3}
              />
            </div>
          )}

          {isAudioFile(item) && item.fileUrl && (
            <div className="form-group">
              <label htmlFor="fileUrl">File URL</label>
              <input
                id="fileUrl"
                name="fileUrl"
                type="url"
                value={formData.fileUrl || ""}
                onChange={handleChange}
              />
            </div>
          )}

          <div className="form-actions">
            <button onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default AudioItemEditDialog;
