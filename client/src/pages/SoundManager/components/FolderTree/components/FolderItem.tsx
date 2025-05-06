import React, { useState } from "react";
import { Folder, AudioFile } from "src/pages/SoundManager/components/FolderTree/types.js";
import { handleFolderClick, handleFileClick } from "../utils/ClickHandlers.js";
import { useDropTarget } from "src/hooks/useDropTarget.js";
import FolderHeader from "./FolderHeader.js";
import FileDisplay from "./FileDisplay.js";
import FolderDisplay from "./FolderDisplay.js";

interface FolderItemProps {
  folder: Folder;
  onFolderSelect: (folder: Folder) => void;
  onFileSelect: (file: AudioFile) => void;
  selectedFolderIds?: number[];
  selectedFileIds?: number[];
  showFilesInTree?: boolean;
  level?: number;
  onFolderDragStart?: (e: React.DragEvent, folder: Folder) => void;
  onFolderDragEnd?: (e: React.DragEvent) => void;
  onFileDragStart?: (e: React.DragEvent, file: AudioFile) => void;
  onFileDragEnd?: (e: React.DragEvent) => void;
  onScanComplete?: () => void;
  onFolderCreated?: (folder: Folder) => void;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  onFolderSelect,
  onFileSelect,
  selectedFolderIds = [],
  selectedFileIds = [],
  level = 0,
  onFolderDragStart,
  onFolderDragEnd,
  onFileDragStart,
  onFileDragEnd,
  onScanComplete,
  onFolderCreated
}) => {
  const [isOpen, setIsOpen] = useState(level === 0); // Auto-expand root level
  
  const hasChildren = folder.children && folder.children.length > 0;
  const hasFiles = folder.files ? folder.files.length > 0 : false;

  // Use the custom hook for drag-and-drop functionality
  const { dropAreaProps } = useDropTarget({
    acceptedTypes: ["folder", "file"],
    onItemsDropped: async (items, context) => {
      console.log("Dropped items:", items);
      console.log("Drop context:", context);
      console.log("Dropped on folder:", folder);
    },
  });

  return (
    <li>
      <div {...{...dropAreaProps, className: `folder-item ${dropAreaProps.className || ''}`}}>
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
          onFolderCreated={onFolderCreated}
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
                level={level + 1}
                onFolderDragStart={onFolderDragStart}
                onFolderDragEnd={onFolderDragEnd}
                onFileDragStart={onFileDragStart}
                onFileDragEnd={onFileDragEnd}
                onScanComplete={onScanComplete}
                onFolderCreated={onFolderCreated}
              />
            )}

            {/* Add separator if we have both children and files */}
            {hasChildren && hasFiles && (
              <li className="folder-separator"></li>
            )}

            {hasFiles &&
              folder.files!.map((file) => (
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
              ))}
          </ul>
        )}
      </div>
    </li>
  );
};

export default FolderItem;