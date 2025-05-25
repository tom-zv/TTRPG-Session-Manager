import React from "react";
import { Folder } from "../types.js";
import FolderItem from "./FolderItem.js";
import { useFolderTree } from "../context/FolderTreeContext.js";

interface FolderDisplayProps {
  folders: Folder[];
  level?: number;
}

const FolderDisplay: React.FC<FolderDisplayProps> = ({
  folders,
  level = 0,
}) => {
  const { folderDownloadProgress } = useFolderTree();
  
  return (
    <ul className="folder-tree" style={{ paddingLeft: level > 0 ? "0" : "0" }}>
      {folders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          level={level}
          downloadProgress={folderDownloadProgress[folder.id]}
        />
      ))}
    </ul>
  );
};

export default React.memo(FolderDisplay);
