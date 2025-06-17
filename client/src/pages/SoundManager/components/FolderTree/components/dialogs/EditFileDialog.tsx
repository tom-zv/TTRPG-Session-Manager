import React, { useState, useRef, useEffect } from "react";
import Dialog from "src/components/Dialog/Dialog.js";
import { useUpdateFile } from "src/pages/SoundManager/api/files/useFileMutations.js";
import EditableField from "src/components/EditableField/EditableField.js";
import "./EditFileDialog.css";
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

const EditFileDialog: React.FC<EditProps> = ({
  isOpen,
  id,
  onEdit,
  initialData = { name: "", path: "", url: "" },
  onClose = () => null,
}) => {
  const updateFile = useUpdateFile();
  const [formData, setFormData] = useState<Record<string, string>>({
    name: "",
    path: "",
    url: "",
  });
  const [error, setError] = useState<string | null>(null);
  const dirtyFields = useRef<Set<string>>(new Set());
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: initialData.name || "",
        path: initialData.path || "",
        url: initialData.url || "",
      });
      dirtyFields.current.clear();
      setError(null);
    }
  }, [isOpen, initialData]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    dirtyFields.current.add(name);
    setFormData((prev) => ({ ...prev, [name]: value }));
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
          onClose();
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
      onClose={onClose} 
      title="Edit File" 
      contentRef={dialogContentRef}
      className="modern-dialog"
    >
      <div className="file-edit-form">
        {error && <div className="alert alert-danger">{error}</div>}

        <EditableField
          label="Name"
          name="name"
          value={formData.name || ""}
          onChange={handleChange}
        />

        <div className="form-section">
          <h4 className="section-title">File Source</h4>
          
          <EditableField
            label="File URL"
            name="url"
            type="url"
            value={formData.url || ""}
            onChange={handleChange}
          />

          <EditableField
            label="File Path"
            name="path"
            value={formData.path || ""}
            onChange={handleChange}
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-muted" onClick={onClose}>
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
