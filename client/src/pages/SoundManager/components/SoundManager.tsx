import React, { useState } from "react";
import ItemPanel from "./ItemPanel/ItemPanel.js";
import PlaylistPanel from "./PlaylistPanel/PlaylistPanel.js";
import SoundManagerEditView from "./SoundManagerEditView/SoundManagerEditView.js";
import SoundManagerLiveView from "./SoundManagerLiveView/SoundManagerLiveView.js";
import { DropTargetProvider } from "src/components/DropTargetContext/DropTargetContext.js";
import { ItemPanelProvider } from "./ItemPanel/ItemPanelContext.js";
import "./SoundManager.css";

const SoundManagerContent: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false); // State to manage editing mode

  return (
    <div className="sound-manager">
        <div className="sound-manager-layout">
          {/* Debug editing mode switch button */}

          <button
            className="debug-editing-mode-button"
            onClick={() => {
              // Toggle editing mode
              setIsEditing((prev) => !prev);
            }}
            aria-label="Toggle Editing Mode"
          >
            {isEditing ? "Live" : "Edit"}
          </button>

          <div className="sound-manager-left-panel">
            {/* Left panel for item display */}
            <ItemPanel />
            <PlaylistPanel />
          </div>

          <div className="layout-vertical-separator"></div>

          <div className="sound-manager-main-area">
            {isEditing ? <SoundManagerEditView /> : <SoundManagerLiveView />}
          </div>

        </div>
    </div>
  );
};

const SoundManager: React.FC = () => {
  return (
    
    <ItemPanelProvider>
      <DropTargetProvider>
        <SoundManagerContent />
      </DropTargetProvider>
    </ItemPanelProvider>
  );
};

export default SoundManager;
