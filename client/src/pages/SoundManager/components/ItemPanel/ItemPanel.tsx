import React, { useState, useCallback, useRef } from "react";
import FolderTree from "src/pages/SoundManager/components/FolderTree/index.js";
import { BsFileEarmarkMusic } from "react-icons/bs";
import { LuChevronsDown, LuChevronsUp } from "react-icons/lu";
import { PiMusicNotesPlusFill } from "react-icons/pi";
import { CollectionItemsDisplay } from "../CollectionItemsDisplay/CollectionItemsDisplay.js";
import { useItemPanel } from "./ItemPanelContext.js";
import CreateCollectionDialog from "../../components/CollectionView/components/CreateCollectionDialog.js";
import { useCollectionMutations } from "../CollectionItemsDisplay/hooks/useCollectionActions.js";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from "react-resizable-panels";
import './ItemPanel.css';

const ItemPanel: React.FC = () => {
  const { itemPanelOptions, isPanelVisible, togglePanelVisibility } =
    useItemPanel();
  const [createMacroDialogOpen, setCreateMacroDialogOpen] = useState(false);

  // Refs for collapsible panels
  const folderTreePanelRef = useRef<ImperativePanelHandle>(null);
  const macroPanelRef = useRef<ImperativePanelHandle>(null);
  const collectionsPanelRef = useRef<ImperativePanelHandle>(null);

  // Track panels to display
  const visiblePanelCount = [
    itemPanelOptions.showFiles,
    itemPanelOptions.showMacros,
    itemPanelOptions.showCollections,
  ].filter(Boolean).length;

  // Calculate default sizes based on visible panel count
  const getDefaultSize = () => Math.floor(100 / visiblePanelCount);

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

  return (
    <div className="item-panel-container">
      <div className="panel-header">
        <h3>
          <BsFileEarmarkMusic />
          Item Panel
        </h3>
        {/* Toggle button to show the panel */}
        <button
          className="toggle-button"
          onClick={togglePanelVisibility}
          title= {isPanelVisible? "Hide panel" : "Show panel"}
          aria-label="Show panel"
        >
          <span className="icon">
            {isPanelVisible ? <LuChevronsUp /> : <LuChevronsDown />}
          </span>
        </button>
      </div>

      {isPanelVisible && visiblePanelCount > 0 && (
        <div className="item-panel-content">
          <PanelGroup direction="vertical" className="item-panel-group">
            {/* Files Panel */}
            {itemPanelOptions.showFiles && (
              <Panel
                ref={folderTreePanelRef}
                defaultSize={getDefaultSize()}
                minSize={15}
              >
                <div className="panel-section folder-tree-section">
                  <FolderTree />
                </div>
              </Panel>
            )}

            {/* Resizable handle between folders and macros */}
            {itemPanelOptions.showFiles && itemPanelOptions.showMacros && (
              <PanelResizeHandle className="separator">
                <div className="drag-handle"></div>
              </PanelResizeHandle>
            )}

            {/* Macros Panel */}
            {itemPanelOptions.showMacros && (
              <Panel
                ref={macroPanelRef}
                defaultSize={getDefaultSize()}
                minSize={15}
                collapsible={true}
                className="panel-with-table"
              >
                <div className="panel-section">
                  <div className="panel-header">
                    <h3>Macros</h3>
                    <button
                      className="create-collection-button"
                      onClick={handleOpenCreateMacroDialog}
                      title="Create New Macro"
                    >
                      <PiMusicNotesPlusFill />
                    </button>
                  </div>
                  <CollectionItemsDisplay
                    collectionType="macro"
                    collectionId={-1}
                    view="list"
                    showToggle={false}
                    showActions={false}
                    showHeaders={false}
                    isSelectable={true}
                    isDragSource={true}
                    isReorderable={false}
                  />
                </div>
              </Panel>
            )}

            {/* Resizable handle between macros and collections */}
            {itemPanelOptions.showMacros &&
              itemPanelOptions.showCollections && (
                <PanelResizeHandle className="separator-handle">
                  <div className="drag-handle"></div>
                </PanelResizeHandle>
              )}

            {/* Collections Panel */}
            {itemPanelOptions.showCollections && (
              <Panel
                ref={collectionsPanelRef}
                defaultSize={getDefaultSize()}
                minSize={15}
                className="panel-with-table"
              >
                <div className="panel-section">
                  <div className="panel-header">
                    <h3>Collections</h3>
                  </div>
                  <CollectionItemsDisplay
                    collectionType="pack"
                    collectionId={-1}
                    view="list"
                    showToggle={false}
                    showActions={false}
                    showHeaders={false}
                    isSelectable={false}
                    isDragSource={true}
                    isReorderable={false}
                  />
                </div>
              </Panel>
            )}
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
      )}
    </div>
  );
};

export default ItemPanel;
