import React from "react";
import FolderTree from "src/components/FolderTree/index.js";
import { BsFileEarmarkMusic } from "react-icons/bs";
import { LuChevronsDown, LuChevronsUp } from "react-icons/lu";
import { CollectionItemsDisplay } from "../CollectionItemsDisplay/CollectionItemsDisplay.js";
import { useItemPanel } from "./ItemPanelContext.js";

import "./ItemPanel.css";

const ItemPanel: React.FC = () => {
  const { itemPanelOptions, isPanelVisible, togglePanelVisibility } =
    useItemPanel();

  return (
    <div className="item-panel-container">
      <div className="item-panel-header">
        <h3 className="item-panel-header-text">
          <span className="icon">
            {" "}
            <BsFileEarmarkMusic />{" "}
          </span>
          Item Panel
        </h3>
        {/* Toggle button to show the panel */}
        <button
          className="panel-toggle-button closed"
          onClick={togglePanelVisibility}
          aria-label="Show panel"
        >
          <span className="icon-toggle">
            {isPanelVisible ? <LuChevronsDown /> : <LuChevronsUp />}
          </span>
        </button>
      </div>

      {isPanelVisible && (
        <div className="item-panel-content">
          {itemPanelOptions.showFiles && (
            <FolderTree
              showFilesInTree={true}
            />
          )}

          {/* Separator */}
          {itemPanelOptions.showFiles &&
            (itemPanelOptions.showMacros ||
              itemPanelOptions.showCollections) && (
              <div className="layout-horizontal-separator"></div>
            )}

          {/* Show macros if showMacros is true */}
          { (
            <div className="macro-display-panel visible">
              <h3>Macros</h3>
              <CollectionItemsDisplay
                collectionType="macro"
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
          )}

          {/* Show collections if showCollections is true */}
          {itemPanelOptions.showCollections && (
            <div className="collections-display-panel visible">
              <h3>Collections</h3>
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
          )}
        </div>
      )}
    </div>
  );
};

export default ItemPanel;
