import { useState, useEffect, useCallback, useMemo } from "react";
import { Folder, AudioFileUI } from "../types.js";
import { getAllFolders } from "src/pages/SoundManager/api/folderApi.js";
import { getAllAudioFiles } from "src/pages/SoundManager/api/fileApi.js";
import { buildFolderTree } from "../utils/FolderTree.js";
import {
  AnyDownloadPayload,
  downloadEventBus,
} from "src/services/EventBus/DownloadEventBus.js";
import {
  DownloadEventType,
  DownloadItemErrorDTO,
  DownloadJobErrorDTO,
  DownloadProgressDTO,
} from "shared/DTO/files.js";
import { SocketEvent } from "shared/sockets/types.js";

type FolderMap = Record<number, Folder>;
type AudioFileMap = Record<number, AudioFileUI>;

export type FileErrorEntry = {
  message: string;
  title?: string;
  url?: string;
};

export type JobErrorEntry = {
  message: string;
  timestamp?: number;
  recoverable?: boolean;
};

export type DownloadProgress = {
  jobId: string;
  index: number;
  total: number;
  fileErrors?: FileErrorEntry[];
  jobError?: JobErrorEntry;
};

type FolderJobProgressMap = Record<string, DownloadProgress>;
export type NestedProgressMap = Record<number, FolderJobProgressMap>;

export function useFolderTreeData() {
  // Internal state
  const [audioFilesById, setAudioFilesById] = useState<AudioFileMap>({});
  const [folderDownloadProgress, setFolderDownloadProgress] =
    useState<NestedProgressMap>({});
  const [foldersById, setFoldersById] = useState<FolderMap>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  // Socket listener for file updates
  const downloadListener = useCallback(
    (event: SocketEvent<DownloadEventType, AnyDownloadPayload>) => {
      switch (event.type) {
        case "DownloadProgress": {
          const payload = event.payload as unknown as DownloadProgressDTO;
          const folderId = payload.file.folderId;
          const jobId = payload.jobId;
          const newProgress: DownloadProgress = {
            jobId,
            index: payload.fileIndex,
            total: payload.totalFiles,
          };

          setFolderDownloadProgress((prev) => {
            const updated = { ...prev };
            const folderMap = { ...(updated[folderId] || {}) };

            // Overwrite or insert this job's progress
            folderMap[jobId] = newProgress;
            updated[folderId] = folderMap;
            return updated;
          });
          break;
        }

        case "DownloadItemError": {
          const payload = event.payload as unknown as DownloadItemErrorDTO;
          const folderId = payload.folderId;
          const jobId = payload.jobId;
          const errorEntry: FileErrorEntry = {
            message: payload.errorMessage || "Download failed",
            title: payload.title,
            url: payload.url,
          };

          setFolderDownloadProgress((prev) => {
            const updated = { ...prev };
            const folderMap = { ...(updated[folderId] || {}) };
            const current = folderMap[jobId];

            if (current) {
              // Append to existing fileErrors array
              folderMap[jobId] = {
                ...current,
                fileErrors: [...(current.fileErrors || []), errorEntry],
              };
            } else {
              // Create a new DownloadProgress entry for this job
              folderMap[jobId] = {
                jobId,
                index: payload.fileIndex,
                total: payload.totalFiles,
                fileErrors: [errorEntry],
              };
            }

            updated[folderId] = folderMap;
            return updated;
          });
          break;
        }

        case "DownloadJobError": {
          const payload = event.payload as DownloadJobErrorDTO;
          const jobId = payload.jobId;
          setFolderDownloadProgress((prev) => {
            const updated = { ...prev };

            // Search for the folderId containing this jobId
            const folderEntry = Object.entries(updated).find(
              ([, jobMap]) => jobMap[jobId] !== undefined
            );

            if (folderEntry) {
              const folderId = Number(folderEntry[0]);
              const folderMap = { ...updated[folderId] };
              const current = folderMap[jobId];

              if (current) {
                folderMap[jobId] = {
                  ...current,
                  jobError: {
                    message: payload.errorMessage || "Download job failed",
                  },
                };
                updated[folderId] = folderMap;
              }
            }

            return updated;
          });
          break;
        }
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = downloadEventBus.subscribe(downloadListener, {
      downloadType: "audio",
    });
    return () => unsubscribe();
  }, [downloadListener]);

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

      // Delete the folders
      setFoldersById((prev) => {
        const next = { ...prev };
        folderIdsToDelete.forEach((id) => delete next[id]);
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

      // Also clear any progress entries for those folders
      setFolderDownloadProgress((prev) => {
        const updated = { ...prev };
        folderIdsToDelete.forEach((id) => {
          delete updated[id];
        });
        return updated;
      });
    },
    [foldersById]
  );

  const handleFileCreated = useCallback((file: AudioFileUI) => {
    setAudioFilesById((prev) => ({ ...prev, [file.id]: file }));
  }, []);

  const handleFileUpdated = useCallback((file: AudioFileUI) => {
    setAudioFilesById((prev) => ({
      ...prev,
      [file.id]: file,
    }));
  }, []);

  /**
   * Initializes download progress tracking for a job after receiving an HTTP 202 response.
   *
   * `jobId` - The ID of the download job
   * `folderId` - The ID of the folder being downloaded
   *
   */
  const initializeDownloadProgress = useCallback(
    (jobId: string, folderId: number) => {
      setFolderDownloadProgress((prev) => {
        const updated = { ...prev };
        const folderMap = { ...(updated[folderId] || {}) };

        // Initialize a new progress entry
        folderMap[jobId] = {
          jobId,
          index: 0,
          total: 1, 
        };

        updated[folderId] = folderMap;
        return updated;
      });
    },
    []
  );

  const handleFileDownloadError = useCallback(
    (jobId: string, folderId: number, error: string) => {
      const errorProgress: DownloadProgress = {
        jobId,
        index: 0,
        total: 0,
        fileErrors: [{ message: error, title: "Download Error", url: "" }],
      };

      setFolderDownloadProgress((prev) => {
        const updated = { ...prev };
        const folderMap = { ...(updated[folderId] || {}) };

        folderMap[jobId] = errorProgress;
        updated[folderId] = folderMap;
        return updated;
      });
    },
    []
  );

  const dismissDownloadError = useCallback(
    (jobId: string, folderId: number) => {
      setFolderDownloadProgress((prev) => {
        const updated = { ...prev };
        const folderMap = { ...(updated[folderId] || {}) };

        // Only delete the job entry if it exists
        if (folderMap[jobId]) {
          delete folderMap[jobId];
        }

        // If no more jobs under this folder, remove the folder key
        if (Object.keys(folderMap).length === 0) {
          delete updated[folderId];
        } else {
          updated[folderId] = folderMap;
        }

        return updated;
      });
    },
    []
  );

  return {
    flatAudioFiles,
    flatFolders,
    folderTree,
    folderDownloadProgress,
    loading,
    error,
    reload: loadData,
    handleFolderCreated,
    handleFolderDeleted,
    handleFileCreated,
    handleFileUpdated,
    initializeDownloadProgress,
    handleFileDownloadError,
    dismissDownloadError,
  };
}
