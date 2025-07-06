import React, { useState, useCallback, useRef } from "react";
import FolderTree from "src/pages/SoundManager/components/FolderTree/index.js";
import { BsFileMusicFill } from "react-icons/bs";
import { IoClose } from "react-icons/io5";
import { LuChevronsDown, LuChevronsUp } from "react-icons/lu";
import { PiMusicNotesPlusFill } from "react-icons/pi";
import { CollectionItemsDisplay } from "../CollectionItemsDisplay/CollectionItemsDisplay.js";
import CreateCollectionDialog from "../CollectionView/components/CreateCollectionDialog.js";
import { useCollectionMutations } from "../CollectionItemsDisplay/hooks/useCollectionActions.js";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  
} from "react-resizable-panels";
import "./ItemDrawer.css";
import { useItemDrawer } from "./ItemDrawerContext.js";
import { useElementHeightPct } from "../../utils/useElementHeightPct.js";

const ItemDrawer: React.FC = () => {
  const [createMacroDialogOpen, setCreateMacroDialogOpen] = useState(false);
  const [isMacroPanelCollapsed, setIsMacroPanelCollapsed] = useState(false);

  const { hideItemDrawer } = useItemDrawer();


  const macroPanelHeaderRef = useRef<HTMLDivElement>(null);
  const drawerContentDivRef = useRef<HTMLDivElement | null>(null);
  const panelGroupRef = useRef(null);
  const macroPanelMinPct = useElementHeightPct(drawerContentDivRef, macroPanelHeaderRef, 5);

  // Set up collection mutation hooks for creating macros
  const { createCollection } = useCollectionMutations(
    -1, // Virtual collection ID
    "macro",
    {
      onAddSuccess: () => {
        setCreateMacroDialogOpen(false);
      },
    }
  );

  // Handle opening the create dialog
  const handleOpenCreateMacroDialog = useCallback(() => {
    setCreateMacroDialogOpen(true);
  }, []);
  const toggleMacroPanel = useCallback(() => {
    setIsMacroPanelCollapsed(!isMacroPanelCollapsed);
  }, [isMacroPanelCollapsed]);

  return (
    <div className="item-drawer-container">
      <div className="item-drawer-accent-line"></div>
      <div className="item-drawer-header">
                  <div className="drawer-title">
                    <BsFileMusicFill />
                    <span> Audio Library</span>
                  </div>
                  <button 
                    className="drawer-close-button" 
                    onClick={hideItemDrawer}
                    title="Close Panel"
                  >
                    <IoClose />
                  </button>
                </div>

      <div className="item-drawer-content" ref={drawerContentDivRef}>
        <PanelGroup
          direction="vertical"
          className="item-drawer-group"
          ref={panelGroupRef}
        >
          {/* Files Panel */}
          <Panel defaultSize={50} minSize={15}>
            <div className="drawer-section folder-tree-section">
              <FolderTree />
            </div>
          </Panel>

          <PanelResizeHandle className="separator-handle">
            <div className="drag-handle"></div>
          </PanelResizeHandle>

          <Panel
            defaultSize={50}
            minSize={macroPanelMinPct}
            className="panel-with-table macro-drawer"
          >
            <div className="drawer-section macro-drawer-section">
              <div
                className={`panel-header${isMacroPanelCollapsed ? " collapsed" : ""}`}
                ref={macroPanelHeaderRef}
              >
                <h3>Macros</h3>

                <div className="panel-header-actions">
                  <button
                    className="create-collection-button"
                    onClick={handleOpenCreateMacroDialog}
                    title="Create New Macro"
                  >
                    <PiMusicNotesPlusFill />
                  </button>

                  <button
                    className="drawer-toggle-button"
                    onClick={toggleMacroPanel}
                    title={
                      isMacroPanelCollapsed ? "Expand macros" : "Hide macros"
                    }
                    aria-label="Toggle macros visibility"
                  >
                    <span className="icon">
                      {isMacroPanelCollapsed ? (
                        <LuChevronsDown />
                      ) : (
                        <LuChevronsUp />
                      )}
                    </span>
                  </button>
                </div>
              </div>
              {/* Content container that collapses */}
              <div
                className={`macro-content-container ${
                  isMacroPanelCollapsed ? "collapsed" : ""
                }`}
              >
                <CollectionItemsDisplay
                  collectionType="macro"
                  collectionId={-1}
                  view="list"
                  showToggle={false}
                  showActions={true}
                  showHeaders={false}
                  isSelectable={true}
                  isDragSource={true}
                  isReorderable={false}
                />
              </div>
            </div>
          </Panel>
        </PanelGroup>

        {/* Dialog for creating macros */}
        {createMacroDialogOpen && (
          <CreateCollectionDialog
            isOpen={createMacroDialogOpen}
            onClose={() => setCreateMacroDialogOpen(false)}
            collectionType="macro"
            createCollection={createCollection!}
          />
        )}
      </div>
    </div>
  );
};

export default ItemDrawer;
