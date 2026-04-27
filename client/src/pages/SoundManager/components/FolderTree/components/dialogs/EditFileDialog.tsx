import React, { useCallback, useMemo, useRef, useState } from "react";
import Dialog from "src/components/Dialog/Dialog.js";
import { useUpdateFile } from "src/pages/SoundManager/api/files/useFileMutations.js";
import { EditableField } from "src/components/FormControls/index.js";
import styles from "./EditFileDialog.module.css";
import { AudioFileUI } from "../../types.js";

type EditProps = {
  isOpen: boolean;
  id: number;
  onEdit: (updatedFile?: AudioFileUI) => void;
  initialData?: {
    name: string;
    path: string;
    url: string;
  };
  onClose?: () => void;
};

type EditFileFormData = {
  name: string;
  path: string;
  url: string;
};

type EditFileFormDraft = {
  key: string;
  formData: EditFileFormData;
};

const EditFileDialog: React.FC<EditProps> = ({
  isOpen,
  id,
  onEdit,
  initialData = { name: "", path: "", url: "" },
  onClose = () => null,
}) => {
  const updateFile = useUpdateFile();
  const initialFormData = useMemo(
    () => ({
      name: initialData.name || "",
      path: initialData.path || "",
      url: initialData.url || "",
    }),
    [initialData]
  );
  const formKey = useMemo(
    () => `${id}:${initialFormData.name}:${initialFormData.path}:${initialFormData.url}`,
    [id, initialFormData]
  );
  const [formDraft, setFormDraft] = useState<EditFileFormDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const activeDraft = formDraft?.key === formKey ? formDraft : null;
  const formData = activeDraft?.formData ?? initialFormData;

  const handleClose = useCallback(() => {
    setFormDraft(null);
    setError(null);
    onClose();
  }, [onClose]);

  const handleChange = (name: string, value: string) => {
    setFormDraft((currentDraft) => {
      const baseFormData =
        currentDraft?.key === formKey
          ? currentDraft.formData
          : initialFormData;

      return {
        key: formKey,
        formData: { ...baseFormData, [name]: value },
      };
    });
  };

  const handleSave = async () => {
    try {
      setError(null);

      if (!formData.name.trim()) {
        setError("File name is required");
        return;
      }

      const payload = {
        id,
        name: formData.name,
        path: formData.path,
        url: formData.url,
      };

      updateFile.mutate(payload, {
        onSuccess: (updatedFile) => {
          onEdit(updatedFile);
          handleClose();
        },
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to save file");
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    }
  };

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={handleClose}
      title="Edit File" 
      contentRef={dialogContentRef}
      className="modern-dialog"
    >
      <div className={styles.fileEditForm}>
        {error && <div className="alert alert-danger">{error}</div>}

        <EditableField
          label="Name"
          value={formData.name || ""}
          onChange={(value) => handleChange("name", value)}
        />

        <div className="form-section">
          <h4 className="section-title">File Source</h4>
          
          <EditableField
            label="File URL"
            type="url"
            value={formData.url || ""}
            onChange={(value) => handleChange("url", value)}
          />

          <EditableField
            label="File Path"
            value={formData.path || ""}
            onChange={(value) => handleChange("path", value)}
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-muted" onClick={handleClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={updateFile.isPending}
          >
            {updateFile.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default EditFileDialog;
