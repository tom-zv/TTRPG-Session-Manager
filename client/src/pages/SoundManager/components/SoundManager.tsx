import React, { useEffect, useState } from 'react';
import FolderTree from '../../../components/FolderTree/index.js';
import AudioUploadForm from './AudioUploadForm.js';
import AudioUploadDialog from './AudioUploadDialog.js';
import { PlaylistManager, SoundEffectManager, AmbienceManager, PackManager } from './CollectionManagers.js';
import { AudioItemDisplay} from './AudioItemDisplay/AudioItemDisplay.js';
import AudioApi from '../api/AudioApi.js';
import { packApi } from '../api/collections/collectionApi.js';
import { DropArea, DropTargetProvider } from 'src/components/DropTargetContext/DropTargetContext.js';
import { DROP_ZONES } from 'src/components/DropTargetContext/dropZones.js';
import './SoundManager.css';
import { AudioItem } from '../types/AudioItem.js';

const SoundManager: React.FC = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"playlists" | "sfx" | "ambience" | "packs">("playlists");
  const [folderTreeKey, setFolderTreeKey] = useState<number>(0); // Used to force refresh
  const [packs, setPacks] = useState<any[]>([]); 
  
  useEffect(() => {
    // Fetch all packs on component mount
    const fetchPacks = async () => {
      try {
        const response = await packApi.getAllPacks();
        console.log('Fetched packs:', response);
        setPacks(response || []); // Ensure we set an empty array if response is falsy
      } catch (error) {
        console.error('Error fetching packs:', error);
        setPacks([]); // Reset to empty array on error
      } 
    };

    fetchPacks(); 
  }, []);
  
  // Handle upload success
  const handleUploadSuccess = async () => {
    setIsDialogOpen(false);
    setFolderTreeKey((prevKey) => prevKey + 1);
  };

  // Handle scan button click
  const handleScanClick = async () => {
    await AudioApi.initiateScan();
    setFolderTreeKey((prevKey) => prevKey + 1);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "playlists":
        return <PlaylistManager />;
      case "sfx":
        return <SoundEffectManager />;
      case "ambience":
        return <AmbienceManager />;
      case "packs":
        return <PackManager />;
      default:
        return <PlaylistManager />;
    }
  };


  // Handle adding items to packs
  const handleAddCollectionToPack = async (collections: AudioItem[], packId?: number) => {
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
      console.error('Error adding collections to pack:', error);
    }
  };

  return (
    <DropTargetProvider>
      <div className="sound-manager">
        <div className="sound-manager-layout">
          {/* Folder navigation - no changes */}
          <div className="folder-navigation">
            <div className="folder-navigation-header">
              {/* <h3>Audio Library</h3> */}
            </div>
            <FolderTree key={folderTreeKey} showFilesInTree={true} />

            <div className="sound-manager-controls">
              <button
                className="upload-button"
                onClick={() => setIsDialogOpen(true)}
              >
                Upload New Audio
              </button>
              <button className="scan-button" onClick={handleScanClick}>
                Scan for Audio Files
              </button>
            </div>
          </div>

          {/* Vertical separator */}
          <div className="layout-separator"></div>

          <DropArea
            zoneId={DROP_ZONES.SOUND_MANAGER_CONTENT}
            className="content-display"
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
            </div>

            <div className="content-inner">{renderContent()}</div>

            {/* Pack drop zone using useDropTarget */}
            <DropArea
              zoneId={DROP_ZONES.SOUND_MANAGER_PACK_DROP}
              className="pack-drop-area"
            >
              <div>
                <div className="pack-drop-content">
                  {/* <div className="pack-drop-icon">+</div>
                  <p>Drop collections here to add to a pack</p> */}

                  {/* Display pack grid*/}
                  <div className="collections-grid-view">
                    <AudioItemDisplay
                      items={packs}
                      itemType='pack'
                      view="grid"
                      showToggle={false}
                      showActions={false}
                      name={"packs"}
                      isDragSource={false}
                      isDropTarget={true}
                      dropZoneId={DROP_ZONES.SOUND_MANAGER_PACK_DROP}
                      acceptedDropTypes={['playlist','sfx','ambience']}
                      onAddItems={handleAddCollectionToPack}
                    />
                  </div>
                </div>
              </div>
            </DropArea>

          </DropArea>
        </div>

        <AudioUploadDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
        >
          <AudioUploadForm
            onUploadSuccess={handleUploadSuccess}
            preselectedFolder={undefined}
          />
        </AudioUploadDialog>
      </div>
    </DropTargetProvider>
  );
};

export default SoundManager;