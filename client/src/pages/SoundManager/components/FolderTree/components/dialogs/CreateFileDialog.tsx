import Dialog from "src/components/Dialog/Dialog.js";
import { downloadAudioUrls, uploadAudioFiles } from "src/pages/SoundManager/api/files/fileApi.js";
import { useState, useRef, FormEvent } from "react";
import { AudioType } from "shared/audio/types.js";

type CreateFileDialogProps = {
  isOpen: boolean;
  folderId: number;
  type?: AudioType;
  onClose: () => void;
  onFileDownload: (jobId: string, folderId: number, error?: string) => void;
  onFileDownloadError: (jobId: string, folderId: number, error: string) => void;
  reloadFolder: () => void;
};

// Audio type options for dropdown
const AUDIO_TYPE_OPTIONS: AudioType[] = ["music", "sfx", "ambience", "any"];

const CreateFileDialog: React.FC<CreateFileDialogProps> = ({
  isOpen,
  folderId,
  type,
  onClose,
  onFileDownload,
  onFileDownloadError,
  reloadFolder
}) => {
  // Form state
  const [formData, setFormData] = useState({
    fileName: "",
    url: "",
    fileType: type || "any" as AudioType,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [urlInputActive, setUrlInputActive] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(selectedFiles);
      
      // Use first file name as default if no name is provided and only one file selected
      if (!formData.fileName && selectedFiles.length === 1) {
        const nameWithoutExtension = selectedFiles[0].name.split(".").slice(0, -1).join(".");
        setFormData(prev => ({ ...prev, fileName: nameWithoutExtension }));
      } 
    }
  };

  const toggleInputMode = (useUrl: boolean) => {
    if (useUrl !== urlInputActive) {
      // Reset related state when switching modes
      if (useUrl) {
        setFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setFormData(prev => ({ ...prev, url: "" }));
      }
      setUrlInputActive(useUrl);
    }
  };

  const validateForm = (): boolean => {
    // Basic validation
    if (urlInputActive) {
      if (!formData.url.trim()) {
        alert("Please enter a URL");
        return false;
      }
      
      try {
        // Basic URL validation
        new URL(formData.url);
      } catch {
        alert("Please enter a valid URL");
        return false;
      }
    } else if (files.length === 0) {
      alert("Please select at least one file to upload");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      if (files.length > 0) {
        
          const fileData = {
            name: formData.fileName,
            audioType: formData.fileType,
            folderId,
          };
          
          const response = await uploadAudioFiles(files, fileData);
        
        if (response.success) {
          reloadFolder();
        } else {
          throw new Error(response.error || "Unknown error during upload");
        }
      } else {
        const downloadData = {
          name: formData.fileName,
          folderId,
          url: formData.url,
        };
        
        const response = await downloadAudioUrls(downloadData);

        if (response && response.jobIds && response.jobIds.length > 0) {
          response.jobIds.forEach(jobId => {
            onFileDownload(jobId, folderId);
          });
        } else {
          throw new Error(response.error || "No job IDs returned from download request");
        }
      }
      resetForm();
      onClose();
    } catch (error) {
      // Create client-side jobId for HTTP errors
      const clientJobId = `error-${Date.now()}`;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (files.length === 0) {
        onFileDownloadError(clientJobId, folderId, errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      fileName: "",
      url: "",
      fileType: type || "any",
    });
    setFiles([]);
    setUrlInputActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Add Audio File">
      <form className="create-file-dialog" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="fileName">File Name</label>
          <input
            id="fileName"
            name="fileName"
            type="text"
            value={formData.fileName}
            onChange={handleInputChange}
            placeholder="Enter file name"
            className="file-name-input"
          />
        </div>

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
          <div className="form-group">
            <label htmlFor="url">File URL</label>
            <input
              id="url"
              name="url"
              type="url"
              value={formData.url}
              onChange={handleInputChange}
              placeholder="https://example.com/audio.mp3"
              className="file-url-input"
              required={urlInputActive}
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="file">Audio File{files.length !== 1 && "s"}</label>
            <input
              id="file"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*"
              required={!urlInputActive}
              multiple={true}
            />
            {files.length > 0 && (
              <div className="selected-files-info">
                {files.length} file{files.length !== 1 && "s"} selected
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="fileType">Audio Type</label>
          <select
            id="fileType"
            name="fileType"
            value={formData.fileType}
            onChange={handleInputChange}
            className="file-type-select"
          >
            {AUDIO_TYPE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="dialog-buttons">
          <button onClick={onClose} className="cancel-btn" type="button">
            Cancel
          </button>
          <button
            className="create-btn"
            type="submit"
            disabled={isSubmitting || (urlInputActive ? !formData.url : files.length === 0)}
          >
            {isSubmitting ? "Processing..." : files.length > 1 ? `Add ${files.length} Files` : "Add File"}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

export default CreateFileDialog;
