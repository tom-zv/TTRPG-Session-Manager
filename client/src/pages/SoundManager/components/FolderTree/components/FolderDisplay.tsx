import React from "react";
import { Folder } from "../types.js";
import FolderItem from "./FolderItem.js";

interface FolderDisplayProps {
  folders: Folder[];
  level?: number;
}

const FolderDisplay: React.FC<FolderDisplayProps> = ({
  folders,
  level = 0
}) => {
  return (
    <ul className="folder-tree" style={{ paddingLeft: level > 0 ? "0" : "0" }}>
      {folders.map((folder) => (
        <FolderItem 
          key={folder.id}
          folder={folder}
          level={level}
        />
      ))}
    </ul>
  );
};

export default React.memo(FolderDisplay);
