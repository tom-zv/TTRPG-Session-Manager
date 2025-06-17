import { useState } from "react";
import Dialog from "src/components/Dialog/Dialog.js";
import { createFolder } from "src/pages/SoundManager/api/folderApi.js";
import { Folder } from "../../types.js";

type CreateFolderDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  parentFolderId: number;
  folderType: Folder["type"];
  onFolderCreated?: (folder: Folder) => void;
};

const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  isOpen,
  onClose,
  parentFolderId,
  folderType,
  onFolderCreated,
}) => {
  const [folderName, setFolderName] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      setError("Folder name cannot be empty");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      setFolderName("");
      onClose();

      const createdFolder = await createFolder(
        folderName,
        parentFolderId,
        folderType
      );
      onFolderCreated?.(createdFolder);
      
    } catch (error) {
      console.error("Error creating folder:", error);
      setError("Failed to create folder. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Create Folder">
      <div
        className="create-folder-dialog"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <input
          type="text"
          value={folderName}
          onChange={(e) => {
            setFolderName(e.target.value);
            setError(null);
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Enter folder name"
          disabled={isCreating}
        />

        {error && <div className="error-message">{error}</div>}

        <div className="dialog-buttons">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCreateFolder();
            }}
            disabled={isCreating || !folderName.trim()}
          >
            {isCreating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default CreateFolderDialog;
