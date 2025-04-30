import React, { useState } from "react";
import { Folder, AudioFile } from "src/components/FolderTree/types.js";
import { handleFolderClick, handleFileClick } from "../utils/ClickHandlers.js";
import FolderHeader from "./FolderHeader.js";
import FileDisplay from "./FileDisplay.js";

interface FolderDisplayProps {
  folders: Folder[];
  onFolderSelect: (folder: Folder) => void;
  onFileSelect: (file: AudioFile) => void;
  selectedFolderIds?: number[];
  selectedFileIds?: number[];
  audioFiles?: AudioFile[];
  showFilesInTree?: boolean;
  level?: number;
  onFolderDragStart?: (e: React.DragEvent, folder: Folder) => void;
  onFolderDragEnd?: (e: React.DragEvent) => void;
  onFileDragStart?: (e: React.DragEvent, file: AudioFile) => void;
  onFileDragEnd?: (e: React.DragEvent) => void;
  onScanComplete?: () => void;
}

const FolderDisplay: React.FC<FolderDisplayProps> = ({
  folders,
  onFolderSelect,
  onFileSelect,
  selectedFolderIds = [],
  selectedFileIds = [],
  audioFiles = [],
  showFilesInTree = false,
  level = 0,
  onFolderDragStart,
  onFolderDragEnd,
  onFileDragStart,
  onFileDragEnd,
  onScanComplete
}) => {
  return (
    <ul className="folder-tree" style={{ paddingLeft: level > 0 ? "0" : "0" }}>
      {folders.map((folder) => {
        const [isOpen, setIsOpen] = useState(level === 0); // Auto-expand root level
        const hasChildren = folder.children && folder.children.length > 0;
        const folderFiles = showFilesInTree
          ? audioFiles.filter((file) => file.folderId === folder.id)
          : [];
        const hasFiles = folderFiles.length > 0;

        return (
          <li key={folder.id}>
            <div className="folder-item">
              <FolderHeader
                folder={folder}
                isSelected={selectedFolderIds?.includes(folder.id)}
                isOpen={isOpen}
                hasContents={hasChildren || hasFiles}
                onClick={(e) =>
                  handleFolderClick(
                    e,
                    folder,
                    isOpen,
                    setIsOpen,
                    onFolderSelect
                  )
                }
                onDragStart={(e) => onFolderDragStart && onFolderDragStart(e, folder)}
                onDragEnd={onFolderDragEnd}
                onScanComplete={onScanComplete}
              />

              {isOpen && (
                <ul className="folder-children">
                  {/* Render subfolders first */}
                  {hasChildren && folder.children && (
                    <FolderDisplay
                      folders={folder.children}
                      onFolderSelect={onFolderSelect}
                      onFileSelect={onFileSelect}
                      selectedFolderIds={selectedFolderIds}
                      selectedFileIds={selectedFileIds}
                      audioFiles={audioFiles}
                      showFilesInTree={showFilesInTree}
                      level={level + 1}
                      onFolderDragStart={onFolderDragStart}
                      onFolderDragEnd={onFolderDragEnd}
                      onFileDragStart={onFileDragStart}
                      onFileDragEnd={onFileDragEnd}
                      onScanComplete={onScanComplete}
                    />
                  )}

                  {/* Add separator if we have both children and files */}
                  {hasChildren && hasFiles && showFilesInTree && (
                    <li className="folder-separator"></li>
                  )}

                  {hasFiles &&
                    showFilesInTree &&
                    folderFiles.map((file) => {
                      return (
                        <FileDisplay
                          key={`file-${file.id}`}
                          file={file}
                          isSelected={selectedFileIds.includes(file.id)}
                          onClick={(e) =>
                            handleFileClick(
                              e,
                              file,
                              onFileSelect
                            )
                          }
                          onDragStart={(e) => onFileDragStart && onFileDragStart(e, file)}
                          onDragEnd={onFileDragEnd}
                        />
                      );
                    })}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default FolderDisplay;
