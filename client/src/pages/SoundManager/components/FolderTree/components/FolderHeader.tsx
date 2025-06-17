import React, { useState } from "react";
import { Folder } from "../types.js";
import { getFolderIcon } from "../utils/icons.js";
import { TbFolderPlus } from "react-icons/tb";
import { LuFilePlus2 } from "react-icons/lu";
import { useFolderTree } from "../context/FolderTreeContext.js";
import FileScanButton from "./FileScanButton.js";
import CreateFolderDialog from "./dialogs/CreateFolderDialog.js";
import CreateFileDialog from "./dialogs/CreateFileDialog.js";

interface FolderHeaderProps {
  folder: Folder;
  isOpen: boolean;
  hasContents: boolean;
  onClick?: (e: React.MouseEvent) => void;
  setIsOpen?: React.Dispatch<React.SetStateAction<boolean>>; 
}

const FolderHeader: React.FC<FolderHeaderProps> = ({
  folder,
  isOpen,
  hasContents,
  onClick,
  setIsOpen,
}) => {
  // Get data and handlers from context
  const { 
    selectedFolderIds, 
    handleFolderDragStart, 
    handleFolderDragEnd,
    handleFolderCreated, 
    initializeDownloadProgress,
    handleFileDownloadError,
    reload 
  } = useFolderTree();
  
  const isSelected = selectedFolderIds.includes(folder.id);
  const [isCreateFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [isCreateFileDialogOpen, setCreateFileDialogOpen] = useState(false);

  return (
    <div
      className={`folder-header ${isSelected ? "selected" : ""}`}
      draggable
      onClick={onClick}
      onKeyDown={(e) => {
        // Prevent space/enter triggering folder toggle when typing in input fields
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || 
            target.isContentEditable) {
          return; 
        }
        
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      onDragStart={(e) => handleFolderDragStart(e, folder)}
      onDragEnd={handleFolderDragEnd}
      data-type={folder.type}
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
    >
      <span
        className={`folder-icon ${hasContents ? (isOpen ? "open" : "closed") : ""}`}
      >
        {getFolderIcon(folder.type, isOpen, hasContents)}
      </span>
      <span className="folder-name">{folder.name}</span>
      
      <button
        className="icon-button create-button"
        title="Create File"
        onClick={(e) => {
          e.stopPropagation();
          setCreateFileDialogOpen(true);
        }}
      >
        <LuFilePlus2 />
      </button>

      <button
        className="icon-button create-button"
        title="Create Folder"
        onClick={(e) => {
          e.stopPropagation();
          setCreateFolderDialogOpen(true);
        }}
      >
        <TbFolderPlus />
      </button>
      
      {folder.type === "root" && (
        <FileScanButton onScanComplete={reload} />
      )}

      <CreateFolderDialog
        isOpen={isCreateFolderDialogOpen}
        onClose={() => setCreateFolderDialogOpen(false)}
        parentFolderId={folder.id}
        folderType={folder.type}
        onFolderCreated={(f) => {
          setIsOpen?.(true);
          handleFolderCreated?.(f);
        }}
      />

      <CreateFileDialog
        isOpen={isCreateFileDialogOpen}
        onClose={() => setCreateFileDialogOpen(false)}
        folderId={folder.id}
        type={folder.type === "root" ? "any" : folder.type}
        reloadFolder={reload}
        onFileDownload={initializeDownloadProgress}
        onFileDownloadError={handleFileDownloadError}
      />
      
    </div>
  );
};

export default FolderHeader;
