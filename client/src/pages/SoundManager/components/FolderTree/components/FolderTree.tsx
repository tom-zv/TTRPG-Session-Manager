import React from "react";
import { FolderTreeProvider, useFolderTree } from "../context/FolderTreeContext.js";
import FolderDisplay from "./FolderDisplay.js";
import "../FolderTree.css";

// Inner component that uses the context
const FolderTreeContent: React.FC = () => {
  const { folderTree, loading, error, reload } = useFolderTree();

  if (loading)
    return (
      <div className="folder-tree-container">
        <div className="loading-indicator">Loading audio library...</div>
      </div>
    );

  if (error)
    return (
      <div className="folder-tree-container">
        <div className="error-message">{error}</div>
        <button onClick={reload}>Retry</button>
      </div>
    );

  return (
    <div className="folder-tree-container">
      {/* Only pass the folders prop - everything else comes from context */}
      <FolderDisplay folders={folderTree} />
    </div>
  );
};

// Main component that provides the context
const FolderTree: React.FC = () => {
  return (
    <FolderTreeProvider>
      <FolderTreeContent />
    </FolderTreeProvider>
  );
};

export default FolderTree;
