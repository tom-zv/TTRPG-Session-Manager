import Dialog from "src/components/Dialog/Dialog.js";
import { createAudioFile } from "src/pages/SoundManager/api/fileApi.js";
import { useState, useRef } from "react";
import { AudioType } from "../types.js";

type CreateFileDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  folderId: number;
  type?: "music" | "sfx" | "ambience" | "any";
};

const CreateFileDialog: React.FC<CreateFileDialogProps> = ({
  isOpen,
  onClose,
  folderId,
  type,
}) => {
  const [fileName, setFileName] = useState<string>("");
  const [fileUrl, setFileUrl] = useState<string>("");
  const [fileType, setFileType] = useState<AudioType>(type || "any");
  const [file, setFile] = useState<File | null>(null);
  const [urlInputActive, setUrlInputActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      if (!fileName) {
        // Use the file name as default if no name is provided
        setFileName(e.target.files[0].name.split('.').slice(0, -1).join('.'));
      }
    }
  };

  const toggleInputMode = (useUrl: boolean) => {
    if (useUrl !== urlInputActive) {
      // Reset related state when switching modes
      if (useUrl) {
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setFileUrl("");
      }
      setUrlInputActive(useUrl);
    }
  };

  const handleSubmit = async () => {
    try {
      const audioData = {
        name: fileName,
        audioType: fileType,
        folderId,
        fileUrl: urlInputActive ? fileUrl : undefined
      };

      await createAudioFile(audioData, urlInputActive ? undefined : file || undefined);
      resetForm();
      onClose();
    } catch (error) {
      console.error("Error creating audio file:", error);
    }
  };

  const resetForm = () => {
    setFileName("");
    setFileUrl("");
    type ? setFileType(type) : setFileType('any');
    setFile(null);
    setUrlInputActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Add Audio File">
      <div className="create-file-dialog">
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="Enter file name"
          className="file-name-input"
        />

        <div className="file-source-toggle">
          <button
            className={`source-toggle-btn ${!urlInputActive ? "active" : ""}`}
            onClick={() => toggleInputMode(false)}
            type="button"
          >
            Upload File
          </button>
          <button
            className={`source-toggle-btn ${urlInputActive ? "active" : ""}`}
            onClick={() => toggleInputMode(true)}
            type="button"
          >
            File URL
          </button>
        </div>

        {urlInputActive ? (
          <input
            key="url-input"
            type="url"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="Enter file URL"
            className="file-url-input"
          />
        ) : (
          <input
            key="file-input"
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*"
            className="file-upload-input"
          />
        )}

        {!type ? (
          <input
            type="text"
            value={fileType}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="Enter file name"
            className="file-name-input"
          />
        ) : null}

        <div className="dialog-buttons">
          <button onClick={onClose} className="cancel-btn" type="button">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!fileName || (urlInputActive ? !fileUrl : !file)}
            className="create-btn"
            type="button"
          >
            Add File
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default CreateFileDialog;