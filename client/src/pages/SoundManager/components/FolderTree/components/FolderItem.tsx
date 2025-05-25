import React, { useState } from "react";
import { Folder } from "../types.js";
import { handleFolderClick } from "../utils/ClickHandlers.js";
import { useDropTarget } from "../../../../../hooks/useDropTarget.js";
import FolderHeader from "./FolderHeader.js";
import FileDisplay from "./FileDisplay.js";
import FolderDisplay from "./FolderDisplay.js";

interface FolderItemProps {
  folder: Folder;
  level?: number;
}

const FolderItem: React.FC<FolderItemProps> = ({ folder, level = 0 }) => {
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
          isOpen={isOpen}
          hasContents={hasChildren || hasFiles}
          onClick={(e) =>
            handleFolderClick(
              e,
              folder,
              isOpen,
              setIsOpen,
            )
          }
        />

        {isOpen && (
          <ul className="folder-children">
            {/* Render subfolders first */}
            {hasChildren && folder.children && (
              <FolderDisplay
                folders={folder.children}
                level={level + 1}
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
                />
              ))}
          </ul>
        )}
      </div>
    </li>
  );
};

export default FolderItem;