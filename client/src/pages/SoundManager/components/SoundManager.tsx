import React, { useState, useCallback } from "react";
import ItemPanel from "./ItemPanel/ItemPanel.js";
import PlaylistPanel from "./PlaylistPanel/PlaylistPanel.js";
import SoundManagerLiveView from "./SoundManagerLiveView/SoundManagerLiveView.js";
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
import { usePlaylistPanelSizeCalc } from "../hooks/usePlaylistPanelSizeCalc.js";
import "./SoundManager.css";
import "./LeftPanel.css";

const SoundManagerContent: React.FC = () => {
  const [playlistCount, setPlaylistCount] = useState(0);
  const playlistPanelRef = React.useRef<ImperativePanelHandle>(null);
  
  const { calculatePlaylistPanelSize } = usePlaylistPanelSizeCalc(
    playlistCount, 
    playlistPanelRef
  );

  const handlePlaylistCountChange = useCallback((count: number) => {
    setPlaylistCount(count);
  }, []);

  return (
    <div className="sound-manager">
      <div className="sound-manager-layout">
        <div className="sound-manager-left-panel">
          <div className="panel-group-container">
            <PanelGroup direction="vertical">
              {/* Playlist Panel */}
              <Panel
                ref={playlistPanelRef}
                defaultSize={calculatePlaylistPanelSize()}
                minSize={9}
                className="panel-with-table" 
              >
                <DropArea zoneId={DROP_ZONES.SOUND_MANAGER_PLAYLIST}>
                  <PlaylistPanel
                    onPlaylistCountChange={handlePlaylistCountChange}
                  />
                </DropArea>
              </Panel>

              <PanelResizeHandle className="separator" />

              {/* Item Panel */}
              <Panel
                defaultSize={100 - calculatePlaylistPanelSize()}
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
