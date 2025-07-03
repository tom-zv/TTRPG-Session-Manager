import React, {useEffect} from "react";
import ItemPanel from "./ItemPanel/ItemPanel.js";
import PlaylistPanel from "./PlaylistPanel/PlaylistPanel.js";
import SoundCollectionsPanel from "./SoundCollectionsPanel/SoundCollectionsPanel.js";
import { initializeAudioPathResolver } from "../services/AudioService/utils/pathResolvers.js";
import { DropTargetProvider } from "src/components/DropTargetContext/DropTargetContext.js";
import { ItemPanelProvider } from "./ItemPanel/ItemPanelContext.js";
import { AudioProvider } from "../services/AudioService/index.js";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from "react-resizable-panels";
import PlayBar from "./PlayBar/PlayBar.js";
import { DropArea } from "src/components/DropTargetContext/DropTargetContext.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import "./sound-manager.css";



const SoundManagerContent: React.FC = () => {



  useEffect(() => {
  // Initialize the audio path resolver
  initializeAudioPathResolver()
    .then(() => {
      console.log('Audio path resolver initialized');
    })
    .catch(err => {
      console.error('Failed to initialize audio path resolver:', err);
    });
  
  // Other initialization code...
}, []);
  const playlistPanelRef = React.useRef<ImperativePanelHandle>(null);
  return (
    <div className="sound-manager">
      <div className="sound-manager-layout">
        <div className="sound-manager-left-panel">
          <div className="panel-group-container">
            <PanelGroup direction="vertical">
              {/* Playlist Panel */}
              <Panel
                ref={playlistPanelRef}
                defaultSize={50}
                minSize={9}
                className="panel-with-table" 
              >
                <DropArea zoneId={DROP_ZONES.SOUND_MANAGER_PLAYLIST}>
                  <PlaylistPanel
                    panelRef={playlistPanelRef}
                  />
                </DropArea>
              </Panel>

              <PanelResizeHandle className="separator" />

              {/* Item Panel */}
              <Panel
                defaultSize={50}
                minSize={20}
                className="panel-with-table"
              >
                <ItemPanel />
              </Panel>
            </PanelGroup>
          </div>
          
          {/* Fixed Play Bar */}
          <div className="play-bar-container">
            <PlayBar />
          </div>
        </div>

        <div className="layout-vertical-separator"></div>

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
      <ItemPanelProvider>
        <DropTargetProvider>
          <SoundManagerContent />
        </DropTargetProvider>
      </ItemPanelProvider>
    </AudioProvider>
  );
};

export default SoundManager;
