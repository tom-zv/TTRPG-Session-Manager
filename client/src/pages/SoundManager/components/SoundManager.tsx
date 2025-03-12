import React, { useState, useEffect } from 'react';
import FolderTree from '../../../components/FolderTree/index.js';
import AudioUploadForm from './AudioUploadForm.js';
import AudioUploadDialog from './AudioUploadDialog.js';
import AudioItemList from './AudioItemList.js';
import PlaylistManager from './CollectionManagers.js';
import AudioApi from '../api/AudioApi.js';
import { Folder } from 'shared/types/folder.js';
import { AudioFile } from 'shared/types/audio.js';
import './SoundManager.css';

const SoundManager: React.FC = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<Folder[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<AudioFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<AudioFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'playlists'| 'sfx'>('playlists');
  
  // Fetch all audio files when component mounts
  useEffect(() => {
    const fetchAudioFiles = async () => {
      try {
        setIsLoadingFiles(true);
        setFileError(null);
        const files = await AudioApi.getAllAudioFiles();
        setAudioFiles(files);
      } catch (error) {
        console.error('Failed to fetch audio files:', error);
        setFileError('Failed to load audio files. Please try again later.');
      } finally {
        setIsLoadingFiles(false);
      }
    };

    fetchAudioFiles();
  }, []);
  
  // Filter files whenever selectedFolders or audioFiles changes
  useEffect(() => {
    if (selectedFolders.length > 0 && audioFiles.length > 0) {
      const folderIds = selectedFolders.map(folder => folder.folder_id);
      const filesInFolders = audioFiles.filter(
        file => file.folder_id !== undefined && folderIds.includes(file.folder_id)
      );
      setFilteredFiles(filesInFolders);
    } else {
      setFilteredFiles([]);
    }
  }, [selectedFolders, audioFiles]);
  
  const handleUploadSuccess = async () => {
    setIsDialogOpen(false);
    // Refresh audio files after successful upload
    try {
      const files = await AudioApi.getAllAudioFiles();
      setAudioFiles(files);
    } catch (error) {
      console.error('Failed to refresh audio files:', error);
    }
  };
  
  const handleFolderSelect = (folder: Folder, isMultiSelect: boolean = false) => {
    if (isMultiSelect) {
      // Toggle selection for multi-select
      const folderIndex = selectedFolders.findIndex(f => f.folder_id === folder.folder_id);
      if (folderIndex >= 0) {
        // Remove from selection if already selected
        setSelectedFolders(selectedFolders.filter(f => f.folder_id !== folder.folder_id));
      } else {
        // Add to selection
        setSelectedFolders([...selectedFolders, folder]);
      }
    } else {
      // Single select replaces current selection
      setSelectedFolders([folder]);
      setSelectedFiles([]); // Clear file selection when selecting a new folder
    }
  };
  
  const handleFileSelect = (file: AudioFile, isMultiSelect: boolean = false) => {
    if (isMultiSelect) {
      // Toggle selection for multi-select
      const fileIndex = selectedFiles.findIndex(f => f.audio_file_id === file.audio_file_id);
      if (fileIndex >= 0) {
        // Remove from selection if already selected
        setSelectedFiles(selectedFiles.filter(f => f.audio_file_id !== file.audio_file_id));
      } else {
        // Add to selection
        setSelectedFiles([...selectedFiles, file]);
      }
    } else {
      // Single select replaces current selection
      setSelectedFiles([file]);
      
      // Also select the parent folder if it's not already selected
      const parentFolder = file.folder_id;
      if (!selectedFolders.some(folder => folder.folder_id === parentFolder)) {
        // Find the parent folder
        const folderObj = audioFiles.find(f => f.folder_id === parentFolder);
        if (folderObj) {
          setSelectedFolders([folderObj as unknown as Folder]);
        }
      }
    }
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
    <div className="sound-manager">
      <div className="sound-manager-layout">
        <div className="folder-navigation">
          <div className="folder-navigation-header">
            {/* <h3>Audio Library</h3> */}
          </div>
          <FolderTree
            onFolderSelect={handleFolderSelect}
            onFileSelect={handleFileSelect}
            selectedFolderIds={selectedFolders.map(folder => folder.folder_id)}
            selectedFileIds={selectedFiles.map(file => file.audio_file_id)}
            audioFiles={audioFiles}
            showFilesInTree={true}
          />

          <div className="sound-manager-controls">
            <button
              className="upload-button"
              onClick={() => setIsDialogOpen(true)}
            >
              Upload New Audio
            </button>
            <button className="scan-button" onClick={AudioApi.initiateScan}>
              Scan for Audio Files
            </button>
          </div>
        </div>

        {/* Vertical separator */}
        <div className="layout-separator"></div>

        <div className="content-display">
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
        </div>
      </div>

      <AudioUploadDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      >
        <AudioUploadForm
          onUploadSuccess={handleUploadSuccess}
          preselectedFolder={selectedFolders.length > 0 ? selectedFolders[0].folder_id : undefined}
        />
      </AudioUploadDialog>
    </div>
  );
};

export default SoundManager;