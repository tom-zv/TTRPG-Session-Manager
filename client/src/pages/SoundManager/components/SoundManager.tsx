import React from "react";
import ItemPanel from "./ItemPanel/ItemPanel.js";
import PlaylistPanel from "./PlaylistPanel/PlaylistPanel.js";
import SoundManagerLiveView from "./SoundManagerLiveView/SoundManagerLiveView.js";
import { DropTargetProvider } from "src/components/DropTargetContext/DropTargetContext.js";
import { ItemPanelProvider } from "./ItemPanel/ItemPanelContext.js";
import { AudioProvider } from "./AudioService/index.js";

import "./SoundManager.css";
import PlayBar from "./PlayBar/PlayBar.js";

const SoundManagerContent: React.FC = () => {
  return (
    <div className="sound-manager">
      <div className="sound-manager-layout">
        <div className="sound-manager-left-panel">
          <PlaylistPanel />
          
          <ItemPanel />

          <PlayBar />
        </div>

        <div className="layout-vertical-separator"></div>

        <div className="sound-manager-main-area">
          <SoundManagerLiveView />
        </div>
      </div>
    </div>
  );
};

const SoundManager: React.FC = () => {
  return (
    <AudioProvider>
      <ItemPanelProvider>
        <DropTargetProvider>
          <SoundManagerContent />
        </DropTargetProvider>
      </ItemPanelProvider>
    </AudioProvider>
  );
};

export default SoundManager;
