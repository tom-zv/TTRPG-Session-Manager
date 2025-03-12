import { useState, useCallback, useEffect } from 'react';
import { getAllFolders } from '../../../pages/SoundManager/api/AudioApi.js';
import { buildFolderTree } from '../utils/FolderTree.js';
import { Folder } from 'shared/types/folder.js';

export const useFolderData = () => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const refreshFolders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const allFolders = await getAllFolders();
      const folderTree = buildFolderTree(allFolders);
      setFolders(folderTree);
    } catch (error) {
      console.error("Error loading folders:", error);
      setError("Failed to load folders. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);
  
  return { folders, loading, error, refreshFolders };
};