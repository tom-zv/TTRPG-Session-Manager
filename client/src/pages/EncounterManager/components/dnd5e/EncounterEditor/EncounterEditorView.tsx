import React, { useState, useEffect } from "react";
import { GiWarlockEye } from "react-icons/gi";
import linkStyles from "../Shared/SelectionLink.module.css";
import layoutStyles from "../../shared/EncounterLayout.module.css";
import { EncounterDetails } from "../../shared/EncounterDetails.js";
import { useEncounterEditor } from "src/pages/EncounterManager/hooks/useEncounterEditor.js";
import { useOrderedEntities } from "src/pages/EncounterManager/hooks/dnd5e/useOrderedEntities.js";
import { useEntitySelection } from "src/pages/EncounterManager/hooks/dnd5e/useEntitySelection.js";
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
  const [selectedEntityId, setSelectedEntityId] = useState<number | undefined>();

  const orderedEntities = useOrderedEntities(
    encounter?.entities ?? [],
    encounter?.initiativeOrder ?? []
  );

  const resolvedSelectedEntityId = useEntitySelection(orderedEntities, selectedEntityId);

  const selectedEntity = orderedEntities.find((entity) => entity.instanceId === resolvedSelectedEntityId);
  
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
      <div className={layoutStyles.encounterShell}>
        <div className={layoutStyles.encounterHeader}>
          <div className={layoutStyles.encounterTitle}>
            <h1>{encounter?.name || (hasError ? 'Error' : 'Loading...')}</h1>{" "}
            {syncState && <SyncStatusIndicator syncState={syncState} />}
          </div>
          <div className={layoutStyles.encounterHeaderActions}>
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
          <div className={layoutStyles.encounterLoading}>
            <p>Failed to load encounter.</p>
          </div>
        ) : isLoading ? (
          <div className={layoutStyles.encounterLoading}>
            <p>Loading encounter...</p>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className={layoutStyles.encounterPanels}>
            <Panel defaultSize={100 - entityCardMinSize} minSize={15} className={layoutStyles.panelMinHeight}>
              <EncounterDetails encounter={encounter!} />

              <DnD5eEntityList
                entities={encounter!.entities}
                initiativeOrder={encounter!.initiativeOrder}
                mode="edit"
                actions={actions}
                selectedEntityId={resolvedSelectedEntityId}
                onSelectEntity={setSelectedEntityId}
              />
            </Panel>

            <PanelResizeHandle className={layoutStyles.panelResizeHandle}></PanelResizeHandle>

            <Panel
              defaultSize={entityCardMinSize}
              minSize={entityCardMinSize}
              className={selectedEntity ? layoutStyles.sidePanel : layoutStyles.panelMinHeight}
            >
              <div className={layoutStyles.sidePanelContent}>
                <div className={linkStyles.sidepanelSelectionAnchor}>
                  {selectedEntity && (
                    <div className={`${linkStyles.selectionMarker} ${linkStyles.sidepanelSelectionMarker}`} aria-hidden="true">
                      <GiWarlockEye />
                    </div>
                  )}
                  <DnD5eEntityCard
                    entity={selectedEntity}
                    className={selectedEntity ? linkStyles.linkedEntityCard : undefined}
                  />
                </div>
              </div>
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
