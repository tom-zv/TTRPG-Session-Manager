import React, { useState } from "react";
import CollectionView from "../CollectionView/CollectionView.js";
import {
  Panel,
  Group,
  Separator,
  usePanelRef,
} from "react-resizable-panels";
import { DropArea } from "src/components/DropTargetContext/DropTargetContext.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";
import styles from "./SoundCollectionsPanel.module.css";
import { AmbienceCollapsed } from "./AmbienceCollapsedView.js";

const SoundCollectionsPanel: React.FC = () => {
  const [isAmbienceCollapsed, setIsAmbienceCollapsed] = useState(false);
  const ambiencePanelRef = usePanelRef();

  const toggleAmbienceCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (ambiencePanelRef.current) {
      if (isAmbienceCollapsed) {
        ambiencePanelRef.current.expand();
      } else {
        ambiencePanelRef.current.collapse();
      }
    }
  };

  return (
    <div className={styles.soundCollectionsPanel}>
      <Group orientation="vertical">
        <Panel defaultSize={60} minSize={25}>
          <DropArea
            zoneId={DROP_ZONES.SOUND_MANAGER_SFX}
            className={styles.sfxSection}
          >
            <CollectionView
              collectionType="sfx"
              itemDisplayView="grid"
              dropZoneId={DROP_ZONES.SOUND_MANAGER_SFX}
              acceptedDropTypes={["file", "macro"]}
            />
          </DropArea>
        </Panel>

        <Separator className="separator-handle">
          <div className="drag-handle"></div>
          <button
            className={`collapse-btn ${isAmbienceCollapsed ? "collapsed" : ""}`}
            onClick={toggleAmbienceCollapse}
          >
            {isAmbienceCollapsed ? "▲" : "▼"}
          </button>
        </Separator>

        <Panel
          panelRef={ambiencePanelRef}
          defaultSize={40}
          minSize={20}
          collapsible={true}
          onResize={() => setIsAmbienceCollapsed(ambiencePanelRef.current?.isCollapsed() ?? false)}
          collapsedSize={20}
        >
          <DropArea
            zoneId={DROP_ZONES.SOUND_MANAGER_AMBIENCE}
            className={styles.ambienceSection}
          >
            {isAmbienceCollapsed ? (
              <AmbienceCollapsed />
            ) : (
              <CollectionView
                collectionType="ambience"
                itemDisplayView="grid"
                dropZoneId={DROP_ZONES.SOUND_MANAGER_AMBIENCE}
                acceptedDropTypes={["file"]}
              />
            )}
          </DropArea>
        </Panel>
      </Group>
    </div>
  );
};

export default SoundCollectionsPanel;
