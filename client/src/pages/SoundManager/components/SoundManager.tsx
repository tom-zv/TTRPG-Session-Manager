import React from "react";
import PlaylistPanel from "./PlaylistPanel/PlaylistPanel.js";
import SoundCollectionsPanel from "./SoundCollectionsPanel/SoundCollectionsPanel.js";
import { DropTargetProvider } from "src/components/DropTargetContext/DropTargetContext.js";
import { ItemDrawerProvider, useItemDrawer } from "./ItemDrawer/ItemDrawerContext.js";
import ItemDrawer from "./ItemDrawer/ItemDrawer.js";
import { AudioProvider } from "../services/AudioService/index.js";
import PlayBar from "./PlayBar/PlayBar.js";
import { DropArea } from "src/components/DropTargetContext/DropTargetContext.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import { BsFileMusicFill } from "react-icons/bs";
import "./sound-manager.css";

const SoundManagerContent: React.FC = () => {
  const { isDrawerVisible: isDrawerVisible, showItemDrawer, hideItemDrawer } = useItemDrawer();

  const toggleItemDrawer = () => {
    if (isDrawerVisible) {
      hideItemDrawer();
    } else {
      showItemDrawer();
    }
  };

  return (
    <div className="sound-manager">
      <div className="sound-manager-layout">
        <div className="sound-manager-left-panel">
          
          <div className="playlist-panel-wrapper">
            <DropArea zoneId={DROP_ZONES.SOUND_MANAGER_PLAYLIST}>
              <PlaylistPanel/>
            </DropArea>

            <div className="item-panel-toggle">
            <button 
              className={`item-panel-toggle-button ${isDrawerVisible ? 'active' : ''}`}
              onClick={toggleItemDrawer}
              title={isDrawerVisible ? "Hide Item Panel" : "Show Item Panel"}
            >
              <BsFileMusicFill />
            </button>
          </div>
          
          </div>
          <div className="play-bar-container">
            <PlayBar />
          </div>
        </div>
        <div className="layout-vertical-separator">
          <div className="vertical-separator-bar"></div>
        </div>
        <div className={`item-panel-drawer${isDrawerVisible ? ' open' : ''}`}>
          <ItemDrawer />
        </div>
        <div className="sound-manager-main-panel">
          <SoundCollectionsPanel />
        </div>
      </div>
    </div>
  );
};

const SoundManager: React.FC = () => {
  return (
    <AudioProvider>
      <ItemDrawerProvider>
        <DropTargetProvider>
          <SoundManagerContent />
        </DropTargetProvider>
      </ItemDrawerProvider>
    </AudioProvider>
  );
};

export default SoundManager;
