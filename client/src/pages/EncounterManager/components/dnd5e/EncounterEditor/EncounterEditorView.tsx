import React, { useState, useEffect, useMemo} from "react";
import styles from "./EncounterEditorView.module.css";
import { EncounterDetails } from "../../shared/EncounterDetails.js";
import { useEncounterEditor } from "src/pages/EncounterManager/hooks/useEncounterEditor.js";
import { DnD5eEntityList } from "../Shared/DnD5eEntityList.js";
import Dialog from "src/components/Dialog/Dialog.js";
import { EntityPicker } from "../Shared/EntityPicker/EntityPicker.js";
import { SyncStatusIndicator } from "src/components/SyncStatusIndicator/SyncStatusIndicator.js";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { DnD5eEntityCard } from "../Shared/DnD5eEntityCard/DnD5eEntityCard.js";

interface EncounterEditorProps {
  encounterId: number;
  onExit(): void;
  isGm: boolean;
}

export const EncounterEditor: React.FC<EncounterEditorProps> = ({
  encounterId,
  onExit,
}) => {
  const {
    encounter,
    isLoading,
    syncState,
    forceSyncNow,
    actions,
  } = useEncounterEditor(encounterId, "dnd5e");
  
  const [isEntityPickerOpen, setIsEntityPickerOpen] = useState(false);
  
  // Stabilize selectedEntity reference - use memoized first entity
  const firstEntity = useMemo(() => encounter?.entities[0], [encounter?.entities]);
  const [selectedEntity, setSelectedEntity] = useState(firstEntity);
  
  // Update selected entity when first entity changes (e.g., after loading)
  useEffect(() => {
    if (firstEntity && !selectedEntity) {
      setSelectedEntity(firstEntity);
    }
  }, [firstEntity, selectedEntity]);
  
  const [entityCardMinSize, setEntityCardMinSize] = useState(30);

  // Calculate minimum size for entity card panel
  useEffect(() => {
    const calculateMinSize = () => {
      const width = window.innerWidth;
      const minSizePercentage = Math.min((520 / width) * 100, 50); // Cap at 50%, min 520px
      setEntityCardMinSize(minSizePercentage);
    };

    calculateMinSize();
    window.addEventListener('resize', calculateMinSize);
    return () => window.removeEventListener('resize', calculateMinSize);
  }, []);

  const handleCancel = () => {
    setIsEntityPickerOpen(false);
  };

  const handleAddEntity = (templateId: number, name:string, hp: number) => {
    try {
      actions.global.addEntity(templateId, name, hp)
      setIsEntityPickerOpen(false);
    } catch (error) {
      console.error("Failed to add entity:", error);
    }
  };

  // Determine error state
  const hasError = !isLoading && !encounter;

  return (
    <div className="page-container">
      <div className={styles.liveEncounter}>
        <div className={styles.encounterHeader}>
          <div className={styles.encounterTitle}>
            <h1>{encounter?.name || (hasError ? 'Error' : 'Loading...')}</h1>{" "}
            {syncState && <SyncStatusIndicator syncState={syncState} />}
          </div>
          <div className={styles.encounterHeaderActions}>
            <button onClick={forceSyncNow} disabled={!encounter}>
              Save Now
            </button>
            <button 
              onClick={() => setIsEntityPickerOpen(true)}
              disabled={!encounter}
            >
              + Add Entity
            </button>
            <button onClick={onExit}>Exit Encounter</button>
          </div>
        </div>

        {hasError ? (
          <div className={styles.liveEncounterLoading}>
            <p>Failed to load encounter.</p>
          </div>
        ) : isLoading ? (
          <div className={styles.liveEncounterLoading}>
            <p>Loading encounter...</p>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className={styles.encounterEditorPanels}>
            <Panel defaultSize={100 - entityCardMinSize} minSize={15}>
              <EncounterDetails encounter={encounter!} />

              <DnD5eEntityList
                entities={encounter!.entities}
                initiativeOrder={encounter!.initiativeOrder}
                mode="edit"
                actions={actions}
              />
            </Panel>

            <PanelResizeHandle className={styles.panelResizeHandle}></PanelResizeHandle>

            <Panel defaultSize={entityCardMinSize} minSize={entityCardMinSize}>
              <DnD5eEntityCard
                entity={encounter!.entities.find(
                  (entity) => entity.instanceId === selectedEntity?.instanceId
                )}
              />
            </Panel>
          </PanelGroup>
        )}
        
        <Dialog
          isOpen={isEntityPickerOpen}
          onClose={handleCancel}
          title="Add Entity to Encounter"
        >
          <EntityPicker
            onSelect={handleAddEntity}
            onCancel={handleCancel}
            title="Select an entity to add"
          />
        </Dialog>
      </div>
    </div>
  );
};

export default EncounterEditor;
