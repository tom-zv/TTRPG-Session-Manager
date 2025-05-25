import { useState, useEffect, useCallback, useMemo } from "react";
import { Folder, AudioFileUI } from "../types.js";
import { getAllFolders } from "src/pages/SoundManager/api/folderApi.js";
import { getAllAudioFiles } from "src/pages/SoundManager/api/fileApi.js";
import { buildFolderTree } from "../utils/FolderTree.js";
import { 
  useDownloadProgress, 
} from "./useDownloadProgress.js";

// Type definitions
type FolderMap = Record<number, Folder>;
type AudioFileMap = Record<number, AudioFileUI>;

export function useFolderTreeData() {
  // --- State ---
  const [audioFilesById, setAudioFilesById] = useState<AudioFileMap>({});
  const [foldersById, setFoldersById] = useState<FolderMap>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // --- Normalization utilities ---
  function normalizeFolders(folders: Folder[]): FolderMap {
    return Object.fromEntries(
      folders.map((f) => [f.id, f] as [number, Folder])
    );
  }

  function normalizeAudioFiles(files: AudioFileUI[]): AudioFileMap {
    return Object.fromEntries(
      files.map((f) => [f.id, f] as [number, AudioFileUI])
    );
  }

  // --- File operations ---
  const handleFileCreated = useCallback((file: AudioFileUI) => {
    setAudioFilesById((prev) => ({ ...prev, [file.id]: file }));
  }, []);

  const handleFileUpdated = useCallback((file: AudioFileUI) => {
    setAudioFilesById((prev) => ({
...prev,

      [file.id]: file,
    }));
  }, []);

  // --- Download progress integration ---
  
  const {
    folderDownloadProgress,
    initializeDownloadProgress,
    handleFileDownloadError,
    dismissDownloadProgress,
    cleanupFolderDownloads
  } = useDownloadProgress({ onFileCreated: handleFileCreated });

  // --- Derived data ---
  const folderTree = useMemo(
    () =>
      buildFolderTree(
        Object.values(foldersById),
        Object.values(audioFilesById)
      ),
    [foldersById, audioFilesById]
  );

  const flatFolders = useMemo(() => Object.values(foldersById), [foldersById]);
  const flatAudioFiles = useMemo(
    () => Object.values(audioFilesById),
    [audioFilesById]
  );

  // --- Data loading ---
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load audio files and folders in parallel
      const [files, allFolders] = await Promise.all([
        getAllAudioFiles(),
        getAllFolders()
      ]);
      
      setAudioFilesById(normalizeAudioFiles(files));
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

  // --- Folder operations ---
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

  const handleFolderDeleted = useCallback(
    (folderId: number) => {
      // First identify all folder IDs that need to be deleted (the folder itself and all its descendants)
      const folderIdsToDelete = new Set<number>([folderId]);

      // Find all descendant folders recursively
      const findDescendants = (parentId: number) => {
        Object.values(foldersById).forEach((folder) => {
          if (folder.parentId === parentId) {
            folderIdsToDelete.add(folder.id);
            findDescendants(folder.id);
          }
        });
      };

      findDescendants(folderId);
      const idsToDelete = Array.from(folderIdsToDelete);

      // Delete the folders
      setFoldersById((prev) => {
        const next = { ...prev };
        idsToDelete.forEach((id) => delete next[id]);
        return next;
      });

      // Delete all files in these folders
      setAudioFilesById((prev) => {
        const next = { ...prev };
        Object.values(next).forEach((file) => {
          if (folderIdsToDelete.has(file.folderId)) {
            delete next[file.id];
          }
        });
        return next;
      });

      // Clean up download progress for deleted folders
      cleanupFolderDownloads(idsToDelete);
    },
    [foldersById, cleanupFolderDownloads]
  );

  // --- Hook API ---
  return {
    // Data
    flatAudioFiles,
    flatFolders,
    folderTree,
    folderDownloadProgress,
    loading,
    error,
    
    // Operations
    reload: loadData,
    handleFolderCreated,
    handleFolderDeleted,
    handleFileCreated,
    handleFileUpdated,
    
    // Download management
    initializeDownloadProgress,
    handleFileDownloadError,
    dismissDownloadProgress,
  };
}
