import React, { useState } from "react";
import { Folder } from "src/pages/SoundManager/components/FolderTree/types.js";
import { getFolderIcon } from "../utils/icons.js";
import { TbFolderPlus } from "react-icons/tb";
import { LuFilePlus2 } from "react-icons/lu";

import FileScanButton from "./FileScanButton.js";
import CreateFolderDialog from "./CreateFolderDialog.js";
import CreateFileDialog from "./CreateFileDialog.js";

interface FolderHeaderProps {
  folder: Folder;
  isOpen: boolean;
  hasContents: boolean;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onScanComplete?: () => void;
  onFolderCreated?: (folder: Folder) => void;
}

const FolderHeader: React.FC<FolderHeaderProps> = ({
  folder,
  isSelected,
  isOpen,
  hasContents,
  onClick,
  onDragStart,
  onDragEnd,
  onScanComplete,
  onFolderCreated,
}) => {
  const [isCreateFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [isCreateFileDialogOpen, setCreateFileDialogOpen] = useState(false);

  return (
    <div
      className={`folder-header ${isSelected ? "selected" : ""}`}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-type={folder.type}
    >
      <span
        className={`folder-icon ${hasContents ? (isOpen ? "open" : "closed") : ""}`}
      >
        {getFolderIcon(folder.type, isOpen, hasContents)}
      </span>
      <span className="folder-name">{folder.name}</span>

      <button
        className="icon-button create-button"
        onClick={(e) => {
          e.stopPropagation();
          setCreateFileDialogOpen(true);
        }}
      >
        <LuFilePlus2 />
      </button>

      <button
        className="icon-button create-button"
        onClick={(e) => {
          e.stopPropagation();
          setCreateFolderDialogOpen(true);
        }}
      >
        <TbFolderPlus />
      </button>
      
      {folder.type === "root" && (
        <FileScanButton onScanComplete={onScanComplete} />
      )}

      <CreateFolderDialog
        isOpen={isCreateFolderDialogOpen}
        onClose={() => setCreateFolderDialogOpen(false)}
        parentFolderId={folder.id}
        folderType={folder.type}
        onFolderCreated={onFolderCreated}
      />

      <CreateFileDialog
        isOpen={isCreateFileDialogOpen}
        onClose={() => setCreateFileDialogOpen(false)}
        folderId={folder.id}
        type={folder.type === "root" ? "any" : folder.type}
      />
      
    </div>
  );
};

export default FolderHeader;
