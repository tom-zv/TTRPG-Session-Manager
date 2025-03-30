import { useEffect, useState } from "react";
import { AudioItem } from "../../types/AudioItem.js";
import { PlaylistEditor, SoundEffectEditor, AmbienceEditor, PackEditor, MacroEditor } from "../CollectionEditors.js";
import { packApi } from "../../api/collections/collectionApi.js";
import { useItemPanel } from "../ItemPanel/ItemPanelContext.js";
import { AudioItemsDisplay } from "../AudioItemDisplay/AudioItemsDisplay.js";
import { DropArea } from "src/components/DropTargetContext/DropTargetContext.js";
import { DROP_ZONES } from "src/components/DropTargetContext/dropZones.js";

const SoundManagerEditView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "playlists" | "sfx" | "ambience" | "packs" | "macros"
  >("playlists");
  
  const [packs, setPacks] = useState<any[]>([]);
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

  useEffect(() => {
    // Fetch all packs on component mount
    const fetchPacks = async () => {
      try {
        const response = await packApi.getAllPacks();
        setPacks(response || []); // Ensure we set an empty array if response is falsy
      } catch (error) {
        console.error("Error fetching packs:", error);
        setPacks([]); // Reset to empty array on error
      }
    };

    fetchPacks();
  }, []);

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
  const handleAddCollectionToPack = async (
    collections: AudioItem[],
    packId?: number
  ) => {
    try {
      const collectionIds = collections.map((collection) => collection.id);
      for (const collectionId of collectionIds) {
        packId = packId || 1; // Default to 0 if no packId is provided
        await packApi.addCollectionToPack(packId, collectionId);
      }
      // Refresh packs after adding
      const response = await packApi.getAllPacks();
      setPacks(response || []);
    } catch (error) {
      console.error("Error adding collections to pack:", error);
    }
  };

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
        <DropArea
          zoneId={DROP_ZONES.SOUND_MANAGER_PACK_DROP}
          className="pack-drop-area"
        >
          <div>
            <div className="pack-drop-content">
              <div className="collections-grid-view">
                <AudioItemsDisplay
                  items={packs}
                  collectionType="pack"
                  view="grid"
                  showToggle={false}
                  showActions={false}
                  name={"packs"}
                  isDragSource={false}
                  isDropTarget={true}
                  dropZoneId={DROP_ZONES.SOUND_MANAGER_PACK_DROP}
                  acceptedDropTypes={["playlist", "sfx", "ambience"]}
                  onAddItems={handleAddCollectionToPack}
                />
              </div>
            </div>
          </div>
        </DropArea>
      </DropArea>
    
  );
};

export default SoundManagerEditView;