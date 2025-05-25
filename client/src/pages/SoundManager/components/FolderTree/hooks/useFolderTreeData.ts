import { useState, useEffect, useCallback, useMemo } from "react";
import { Folder, AudioFile } from "../types.js";
import { getAllFolders } from "src/pages/SoundManager/api/folderApi.js";
import { getAllAudioFiles } from "src/pages/SoundManager/api/fileApi.js";
import { buildFolderTree } from "../utils/FolderTree.js";
import { useFileDownloadListener } from "../../../../../services/SocketService/hooks/useAudioSocket.js";

type FolderMap = Record<number, Folder>;
type AudioFileMap = Record<number, AudioFile>;

/**
 * Custom hook to handle all data loading and management for the folder tree
 */
export function useFolderTreeData() {
  // Internal state
  const [audioFilesById, setAudioFilesById] = useState<AudioFileMap>({});
  const [foldersById, setFoldersById] = useState<FolderMap>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  function normalizeFolders(folders: Folder[]): FolderMap {
    return Object.fromEntries(
      folders.map((f) => [f.id, f] as [number, Folder])
    );
  }

  function normalizeAudioFiles(files: AudioFile[]): AudioFileMap {
    return Object.fromEntries(
      files.map((f) => [f.id, f] as [number, AudioFile])
    );
  }

  // Derived data using memoization - modified to pass audioFilesById directly
  const folderTree = useMemo(
    () => buildFolderTree(Object.values(foldersById), Object.values(audioFilesById)),
    [foldersById, audioFilesById]
  );

  const flatFolders = useMemo(() => Object.values(foldersById), [foldersById]);
  const flatAudioFiles = useMemo(() => Object.values(audioFilesById), [audioFilesById]);

  // Socket listener for file updates
  useFileDownloadListener((downloadedFile) => {
    handleFileUpdated(downloadedFile);
  });

  // Load all data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load audio files
      const files = await getAllAudioFiles();
      setAudioFilesById(normalizeAudioFiles(files));
      
      // Load folders
      const allFolders = await getAllFolders();
      setFoldersById(normalizeFolders(allFolders));
    } catch (error) {
      console.error("Error loading library data:", error);
      setError("Failed to load audio library. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data loading
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle folder addition (optimistic or from server)
  const handleFolderCreated = useCallback((newFolder: Folder) => {
    setFoldersById((prev) => {
      // If it's a server-confirmed folder, replace temp ones
      if (newFolder.id > 0) {
        const byId = { ...prev };
        // Find matching temp folder
        for (const id in byId) {
          const f = byId[id];
          if (
            f.id < 0 &&
            f.name === newFolder.name &&
            f.parentId === newFolder.parentId
          ) {
            delete byId[id];
            byId[newFolder.id] = newFolder;
            break;
          }
        }
        return byId;
      } else {
        // Optimistic add
        return { ...prev, [newFolder.id]: newFolder };
      }
    });
  }, []);

  const handleFolderDeleted = useCallback((folderId: number) => {
    // First identify all folder IDs that need to be deleted (the folder itself and all its descendants)
    const folderIdsToDelete = new Set<number>([folderId]);
    
    // Find all descendant folders recursively
    const findDescendants = (parentId: number) => {
      Object.values(foldersById).forEach(folder => {
        if (folder.parentId === parentId) {
          folderIdsToDelete.add(folder.id);
          findDescendants(folder.id);
        }
      });
    };
    
    findDescendants(folderId);
    
    // Delete the folders
    setFoldersById(prev => {
      const next = { ...prev };
      folderIdsToDelete.forEach(id => delete next[id]);
      return next;
    });
    
    // Delete all files in these folders
    setAudioFilesById(prev => {
      const next = { ...prev };
      Object.values(next).forEach(file => {
        if (folderIdsToDelete.has(file.folderId)) {
          delete next[file.id];
        }
      });
      return next;
    });
  }, [foldersById]);
  
  const handleFileCreated = useCallback((file: AudioFile) => {
    setAudioFilesById((prev) => ({ ...prev, [file.id]: file }));
  }, []);

  const handleFileUpdated = useCallback((file: AudioFile) => {
    setAudioFilesById((prev) => ({
      ...prev,
      [file.id]: file,
    }));
  }, []);

  

  return {
    flatAudioFiles, 
    flatFolders,
    folderTree,
    loading,
    error,
    reload: loadData,
    handleFolderCreated,
    handleFolderDeleted,
    handleFileCreated,
    handleFileUpdated,
  };
}