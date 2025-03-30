import React, { useState, useEffect } from "react";
import { macroApi, packApi } from "src/pages/SoundManager/api/collections/collectionApi.js";
import FolderTree from "src/components/FolderTree/index.js";
import AudioItemsDisplay from "../AudioItemDisplay/index.js";
import { useItemPanel } from "./ItemPanelContext.js";
import "./ItemPanel.css";


const ItemPanel: React.FC = () => {
  const [macros, setMacros] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const { itemPanelOptions } = useItemPanel();
  
  // Fetch macros if needed
  useEffect(() => {
    if (itemPanelOptions.showMacros) {
      const fetchMacros = async () => {
        try {
          const response = await macroApi.getAllCollections();
          setMacros(response || []);
        } catch (error) {
          console.error("Error fetching macros:", error);
          setMacros([]);
        }
      };

      fetchMacros();
    }
  }, [itemPanelOptions.showMacros]);

  // Fetch collections if needed - this would depend on your API
  useEffect(() => {
    if (itemPanelOptions.showCollections) {
      
      const fetchCollections = async () => {
        try {
          const response = await packApi.getAllCollections();
          setCollections(response || []);
        } catch (error) {
          console.error("Error fetching collections:", error);
          setCollections([]);
        }
      };
      fetchCollections();
    }
  }, [itemPanelOptions.showCollections]);

  return (
    <>
      {/* Show files if showFiles is true */}
      {itemPanelOptions.showFiles && (
        <FolderTree showFilesInTree={true} />
      )}

      {/* Show separator if we're showing both files and something else */}
      {itemPanelOptions.showFiles && 
       (itemPanelOptions.showMacros || itemPanelOptions.showCollections) && (
        <div className="layout-horizontal-separator"></div>
      )}

      {/* Show macros if showMacros is true */}
      {itemPanelOptions.showMacros && (
        <div className="macro-display-panel visible">
          <h3>Macros</h3>
          <AudioItemsDisplay
            items={macros}
            collectionType="macro"
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
          <AudioItemsDisplay
            items={collections}
            collectionType={"pack"}
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
    </>
  );
};

export default ItemPanel;
