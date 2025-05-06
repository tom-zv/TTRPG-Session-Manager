import React from "react";
import { Folder, AudioFile } from "src/pages/SoundManager/components/FolderTree/types.js";
import FolderItem from "./FolderItem.js";

interface FolderDisplayProps {
  folders: Folder[];
  onFolderSelect: (folder: Folder) => void;
  onFileSelect: (file: AudioFile) => void;
  selectedFolderIds?: number[];
  selectedFileIds?: number[];
  level?: number;
  onFolderDragStart?: (e: React.DragEvent, folder: Folder) => void;
  onFolderDragEnd?: (e: React.DragEvent) => void;
  onFileDragStart?: (e: React.DragEvent, file: AudioFile) => void;
  onFileDragEnd?: (e: React.DragEvent) => void;
  onScanComplete?: () => void;
  onFolderCreated?: (folder: Folder) => void;
}

const FolderDisplay: React.FC<FolderDisplayProps> = ({
  folders,
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
  return (
    <ul className="folder-tree" style={{ paddingLeft: level > 0 ? "0" : "0" }}>
      {folders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          onFolderSelect={onFolderSelect}
          onFileSelect={onFileSelect}
          selectedFolderIds={selectedFolderIds}
          selectedFileIds={selectedFileIds}
          level={level}
          onFolderDragStart={onFolderDragStart}
          onFolderDragEnd={onFolderDragEnd}
          onFileDragStart={onFileDragStart}
          onFileDragEnd={onFileDragEnd}
          onScanComplete={onScanComplete}
          onFolderCreated={onFolderCreated}
        />
      ))}
    </ul>
  );
};

export default FolderDisplay;
