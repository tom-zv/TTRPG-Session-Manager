import { useEffect, useState } from "react";
import { AudioItem, AudioCollection } from "../../types/AudioItem.js";
import { PlaylistEditor, SoundEffectEditor, AmbienceEditor, PackEditor, MacroEditor } from "../CollectionEditors.js";
import { packApi } from "../../api/collections/collectionApi.js";
import { useItemPanel } from "../ItemPanel/ItemPanelContext.js";

import { DropArea } from "src/components/DropTargetContext/DropTargetContext.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";

const SoundManagerEditView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "playlists" | "sfx" | "ambience" | "packs" | "macros"
  >("playlists");
  
  // const [packs, setPacks] = useState<any[]>([]); 
  const { updateItemPanelOptions } = useItemPanel();
  
  useEffect(() => {
    // Configure the panel based on the active tab
    switch (activeTab) {
      case "playlists":
        updateItemPanelOptions({showFiles: true});
        break;
      case "sfx":
        updateItemPanelOptions({showFiles: true, showMacros: true});
        break;
      case "ambience":
        updateItemPanelOptions({showFiles: true});
        break;
      case "packs":
        updateItemPanelOptions({showCollections: true});
        break;
      case "macros":
        updateItemPanelOptions({showFiles: true});
        break;
    }
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "playlists":
        return <PlaylistEditor />;
      case "sfx":
        return <SoundEffectEditor />;
      case "ambience":
        return <AmbienceEditor />;
      case "packs":
        return <PackEditor />;
      case "macros":
        return <MacroEditor />;
      default:
        return <PlaylistEditor />;
    }
  };

  // Handle adding items to packs
  // const handleAddCollectionToPack = async (
  //   collections: AudioItem[],
  //   packId?: number
  // ) => {
  //   try {
  //     const collectionIds = collections.map((collection) => collection.id);
  //     for (const collectionId of collectionIds) {
  //       packId = packId || 1; // Default to 0 if no packId is provided
  //       await packApi.addCollectionToPack(packId, collectionId);
  //     }
  //     // Refresh packs after adding
  //     const response = await packApi.getAllPacks();
  //     setPacks(response || []);
  //   } catch (error) {
  //     console.error("Error adding collections to pack:", error);
  //   }
  // };

  // // Create a collection object for the packs
  // const packsCollection: AudioCollection = {
  //   id: -1, // Virtual collection ID
  //   name: "Packs",
  //   type: "pack",
  //   items: packs
  // };

  return (
    <DropArea
      zoneId={DROP_ZONES.SOUND_MANAGER_CONTENT}
      className="sound-manager-main-area"
    >
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === "playlists" ? "active" : ""}`}
          onClick={() => setActiveTab("playlists")}
        >
          Playlists
        </button>

        <button
          className={`tab-button ${activeTab === "sfx" ? "active" : ""}`}
          onClick={() => setActiveTab("sfx")}
        >
          SFX Collections
        </button>

        <button
          className={`tab-button ${activeTab === "ambience" ? "active" : ""}`}
          onClick={() => setActiveTab("ambience")}
        >
          Ambience Collections
        </button>

        <button
          className={`tab-button ${activeTab === "packs" ? "active" : ""}`}
          onClick={() => setActiveTab("packs")}
        >
          Packs
        </button>

        <button
          className={`tab-button ${activeTab === "macros" ? "active" : ""}`}
          onClick={() => setActiveTab("macros")}
        >
          Macros
        </button>
      </div>

      <div className="content-inner">{renderContent()}</div>

      {/* Pack drop zone using useDropTarget */}
      {/* <DropArea
        zoneId={DROP_ZONES.SOUND_MANAGER_PACK_DROP}
        className="pack-drop-area"
      >
        <div>
          <div className="pack-drop-content">
            <div className="collections-grid-view">
              <CollectionItemsDisplay
                collection={packsCollection}
                view="grid"
                showToggle={false}
                showActions={false}
                isDragSource={false}
                isDropTarget={true}
                dropZoneId={DROP_ZONES.SOUND_MANAGER_PACK_DROP}
                acceptedDropTypes={["playlist", "sfx", "ambience"]}
              />
            </div>
          </div>
        </div>
      </DropArea> */}
    </DropArea>
  );
};

export default SoundManagerEditView;