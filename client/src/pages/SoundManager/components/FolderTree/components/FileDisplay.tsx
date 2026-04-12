import React, { useState } from "react";
import EditFileDialog from "./dialogs/EditFileDialog.js";
import { AudioFileUI } from "../types.js";
import { getFileIcon } from "../utils/icons.js";
import { MdEdit } from "react-icons/md";
import { handleFileClick } from "../utils/ClickHandlers.js";
import { useFolderTree } from "../context/FolderTreeContext.js";
import styles from "../FolderTree.module.css";

interface FileDisplayProps {
  file: AudioFileUI;
}

const FileDisplay: React.FC<FileDisplayProps> = ({ file }) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const {
    selectedFileIds,
    handleFileSelect,
    handleFileDragStart,
    handleFileDragEnd,
    handleFileUpdated
  } = useFolderTree();

  const isSelected = selectedFileIds.includes(file.id);

  const handleEditFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsEditDialogOpen(false);
  };

  const handleEditComplete = (updatedFile?: AudioFileUI) => {
    // Called after a successful edit; update context and close dialog
    if (updatedFile) {
      handleFileUpdated(updatedFile);
    }
    setIsEditDialogOpen(false);
  };

  return (
    <div
      className={[styles.fileItem, isSelected ? styles.selected : ""].filter(Boolean).join(" ")}
      draggable
      onDragStart={(e) => handleFileDragStart(e, file)}
      onDragEnd={handleFileDragEnd}
      onClick={(e) => handleFileClick(e, file, handleFileSelect)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleFileClick(
            e as unknown as React.MouseEvent,
            file,
            handleFileSelect
          );
        }
      }}
      role="button"
      tabIndex={0}
      data-type={file.audioType || "default"}
    >
      <div className={styles.fileHeader}>
        <span className={styles.fileIcon}>
          {getFileIcon(file.audioType || "default")}
        </span>
        <span className={styles.fileName} title={file.name}>
          {file.name}
        </span>
        <button
          className="icon-button edit-button"
          onClick={handleEditFile}
          title="Edit file"
        >
          <MdEdit />
        </button>
      </div>

      {isEditDialogOpen && (
        <EditFileDialog
          id={file.id}
          isOpen={isEditDialogOpen}
          onClose={handleDialogClose}
          onEdit={handleEditComplete}
          initialData={{
            name: file.name,
            path: file.path || "",
            url: file.url || ""
          }}
        />
      )}
    </div>
  );
};

export default React.memo(FileDisplay);
