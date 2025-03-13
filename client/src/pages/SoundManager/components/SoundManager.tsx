import React, { useState } from 'react';
import FolderTree from '../../../components/FolderTree/index.js';
import AudioUploadForm from './AudioUploadForm.js';
import AudioUploadDialog from './AudioUploadDialog.js';
import PlaylistManager from './CollectionManagers.js';
import AudioApi from '../api/AudioApi.js';
import { DropArea, DropTargetProvider } from 'src/components/DropTargetContext/DropTargetContext.js';
import { DROP_ZONES } from 'src/components/DropTargetContext/dropZones.js';
import './SoundManager.css';

const SoundManager: React.FC = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'playlists'| 'sfx'>('playlists');
  const [folderTreeKey, setFolderTreeKey] = useState<number>(0); // Used to force refresh
  
  // Handle upload success
  const handleUploadSuccess = async () => {
    setIsDialogOpen(false);
    // Force FolderTree to refresh by changing its key
    setFolderTreeKey(prevKey => prevKey + 1);
  };
  
  // Handle scan button click
  const handleScanClick = async () => {
    await AudioApi.initiateScan();
    // Force FolderTree to refresh
    setFolderTreeKey(prevKey => prevKey + 1);
  };
  
  const renderContent = () => {
    switch (activeTab) {
      case 'playlists':
        return <PlaylistManager />;
      case 'sfx':
        return <div>SFX Sets</div>;
      default:
        return <PlaylistManager />;
    }
  };
  
  return (
    <DropTargetProvider>
      <div className="sound-manager">
        <div className="sound-manager-layout">
          <div className="folder-navigation">
            <div className="folder-navigation-header">
              {/* <h3>Audio Library</h3> */}
            </div>
            <FolderTree
              key={folderTreeKey} // Using key to force refresh when needed
              showFilesInTree={true}
            />

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
                SFX sets
              </button>
            </div>

            <div className="content-inner">
              {renderContent()}
            </div>
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