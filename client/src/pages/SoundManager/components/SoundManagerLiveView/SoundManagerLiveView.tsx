import React, { useState, useRef } from "react";
import CollectionView from "../../components/CollectionView/CollectionView.js";
import { sfxApi, ambienceApi } from "../../api/collections/collectionApi.js";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from "react-resizable-panels";
import { DropArea } from "src/components/DropTargetContext/DropTargetContext.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import "./SoundManagerLiveView.css";

const SoundManagerLiveView: React.FC = () => {
  const [isAmbienceCollapsed, setIsAmbienceCollapsed] = useState(false);
  const ambiencePanelRef = useRef<ImperativePanelHandle>(null);

  const toggleAmbienceCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (ambiencePanelRef.current) {
      if (isAmbienceCollapsed) {
        ambiencePanelRef.current.expand();
      } else {
        ambiencePanelRef.current.collapse();
      }
      // The state will be updated by onCollapse/onExpand handlers
    }
  };

  return (
    <div className="sound-manager-live-view">
      <PanelGroup direction="vertical">
        <Panel defaultSize={60} minSize={20}>
          
          <DropArea
            zoneId={DROP_ZONES.SOUND_MANAGER_SFX}
            className="sfx-section"
          >
            <CollectionView
              collectionType="sfx"
              collectionName="Sound Effect Collections"
              fetchCollections={sfxApi.getAllCollections}
              fetchCollectionItems={sfxApi.getCollectionFiles}
              onCreateCollection={sfxApi.createCollection}
              onUpdateCollection={(collection) =>
                sfxApi.updateCollection(
                  collection.id,
                  collection.name,
                  collection.description
                )
              }
              onDeleteCollection={sfxApi.deleteCollection}
              onAddItems={sfxApi.addToCollection}
              onRemoveItems={sfxApi.removeFilesFromCollection}
              onUpdateItemPosition={sfxApi.updatePosition}
              itemDisplayView="grid"
              dropZoneId={DROP_ZONES.SOUND_MANAGER_SFX}
              acceptedDropTypes={["file", "macro"]}
            />
          </DropArea>
        </Panel>

        <PanelResizeHandle className="separator-handle">
          <div className="drag-handle"></div>
          <button
            className={`collapse-btn ${isAmbienceCollapsed ? "collapsed" : ""}`}
            onClick={toggleAmbienceCollapse}
          >
            {isAmbienceCollapsed ? "▲" : "▼"}
          </button>
        </PanelResizeHandle>

        <Panel
          ref={ambiencePanelRef}
          defaultSize={40}
          minSize={10}
          collapsible={true}
          onCollapse={() => setIsAmbienceCollapsed(true)}
          onExpand={() => setIsAmbienceCollapsed(false)}
          collapsedSize={10}
        >
          <div
            className={`ambience-section ${
              isAmbienceCollapsed ? "collapsed" : ""
            }`}
          >
            {isAmbienceCollapsed ? (
              <div className="collapsed-info-bar">
                <span>Ambience Collections (collapsed)</span>
              </div>
            ) : (
              <CollectionView
                collectionType="ambience"
                collectionName="Ambience Collections"
                fetchCollections={ambienceApi.getAllCollections}
                fetchCollectionItems={ambienceApi.getCollectionFiles}
                onCreateCollection={ambienceApi.createCollection}
                onUpdateCollection={(collection) =>
                  ambienceApi.updateCollection(
                    collection.id,
                    collection.name,
                    collection.description
                  )
                }
                onDeleteCollection={ambienceApi.deleteCollection}
                onAddItems={ambienceApi.addToCollection}
                onRemoveItems={ambienceApi.removeFilesFromCollection}
                onUpdateItemPosition={ambienceApi.updatePosition}
                itemDisplayView="grid"
                dropZoneId={DROP_ZONES.SOUND_MANAGER_AMBIENCE}
                acceptedDropTypes={["file"]}
              />
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default SoundManagerLiveView;
