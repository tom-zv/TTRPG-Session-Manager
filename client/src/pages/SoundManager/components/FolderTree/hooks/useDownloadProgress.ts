import { useState, useEffect, useCallback } from "react";
import { AudioFileUI } from "../types.js";
import { AnyDownloadPayload, downloadEventBus } from "src/services/EventBus/DownloadEventBus.js";
import {
  AudioFileDTO,
} from "shared/DTO/files.js";

import {
  DownloadCompleteDTO,
  DownloadEventType,
  DownloadItemErrorDTO,
  DownloadJobErrorDTO,
  DownloadMetadataDTO,
  DownloadProgressDTO,
} from "shared/DTO/downloadEvents.js";

import { SocketEvent } from "shared/sockets/types.js";

// Types (exported for reuse)
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
  complete: boolean;
};

type FolderJobProgressMap = Record<string, DownloadProgress>;
export type NestedProgressMap = Record<number, FolderJobProgressMap>;

interface UseDownloadProgressProps {
  onFileCreated: (file: AudioFileUI) => void;
}

export function useDownloadProgress({ onFileCreated }: UseDownloadProgressProps) {
  // Internal state for download progress
  const [folderDownloadProgress, setFolderDownloadProgress] = useState<NestedProgressMap>({});

  // Socket listener for download events
  const downloadListener = useCallback(
    (event: SocketEvent<DownloadEventType, AnyDownloadPayload>) => {
      switch (event.type) {

        case "DownloadProgress": {
          const payload = event.payload as unknown as DownloadProgressDTO<AudioFileDTO>;
          const folderId = payload.file.folderId;
          const jobId = payload.jobId;
          const newProgress: DownloadProgress = {
            jobId,
            index: payload.fileIndex,
            total: payload.totalFiles,
            complete: false
          };

          // Convert DTO to UI model and notify parent
          onFileCreated(payload.file);
          
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
        
        case "DownloadMetadata": {
            const payload = event.payload as DownloadMetadataDTO<AudioFileDTO>;
            const folderId = payload.folderId;
            const jobId = payload.jobId;
            
            if (payload.totalFiles !== undefined) {
              const totalFiles = payload.totalFiles;
              
              setFolderDownloadProgress((prev) => {
                const updated = { ...prev };
                const folderMap = { ...(updated[folderId] || {}) };
                const existingProgress = folderMap[jobId];
                
                const newProgress: DownloadProgress = {
                  ...existingProgress, 
                  jobId,
                  total: totalFiles,
                };

                // Update the job's progress
                folderMap[jobId] = newProgress;
                updated[folderId] = folderMap;
                return updated;
              });
            }
            break;
        }

        case "DownloadComplete": {
          const payload = event.payload as DownloadCompleteDTO<AudioFileDTO>;
          const folderId = payload.folderId;
          const jobId = payload.jobId;
          
          if (payload.file) {
            onFileCreated(payload.file);
          }
          
          setFolderDownloadProgress((prev) => {
            const updated = { ...prev };
            
            // If we have a folder ID, update that specific folder's job
            if (folderId) {
              const folderMap = { ...(updated[folderId] || {}) };
            
              if (folderMap[jobId]) {
                folderMap[jobId] = {
                  ...folderMap[jobId],
                  complete: true
                };
              }
              
              updated[folderId] = folderMap;
            } else {
              // If no folder ID, search for the job across all folders
              for (const [fId, jobMap] of Object.entries(updated)) {
                if (jobMap[jobId]) {
                  const folderMap = { ...jobMap };
                  
                  // Mark as complete instead of deleting
                  folderMap[jobId] = {
                    ...folderMap[jobId],
                    complete: true
                  };
                  
                  updated[Number(fId)] = folderMap;
                  break;
                }
              }
            }
            
            return updated;
          });
          break;
        }

        case "DownloadItemError": {
          const payload = event.payload as unknown as DownloadItemErrorDTO<AudioFileDTO>;
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
                complete: payload.fileIndex == payload.totalFiles,
                fileErrors: [errorEntry],
              };
            }

            updated[folderId] = folderMap;
            return updated;
          });
          break;
        }

        case "DownloadJobError": {
          const payload = event.payload as DownloadJobErrorDTO<AudioFileDTO>;
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
    [onFileCreated]
  );

  // Set up event listeners for download events
  useEffect(() => {
    const unsubscribe = downloadEventBus.subscribe(downloadListener, {
      downloadType: "audio",
    });
    return () => unsubscribe();
  }, [downloadListener]);

  // Initialize progress tracking for a new download job
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
          complete: false, 
        };

        updated[folderId] = folderMap;
        return updated;
      });
    },
    []
  );

  // Handle client-side download errors
  const handleFileDownloadError = useCallback(
    (jobId: string, folderId: number, error: string) => {
      const errorProgress: DownloadProgress = {
        jobId,
        index: 0,
        total: 0,
        complete: false,
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

  // Dismiss download progress/errors
  const dismissDownloadProgress = useCallback(
    (jobId: string, folderId: number) => {
      setFolderDownloadProgress((prev) => {
        const updated = { ...prev };
        const folderMap = { ...(updated[folderId] || {}) };
        
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

  // When a folder is deleted, clean up its download progress
  const cleanupFolderDownloads = useCallback((folderIds: number[]) => {
    setFolderDownloadProgress((prev) => {
      const updated = { ...prev };
      folderIds.forEach((id) => {
        delete updated[id];
      });
      return updated;
    });
  }, []);

  return {
    folderDownloadProgress,
    initializeDownloadProgress,
    handleFileDownloadError,
    dismissDownloadProgress,
    cleanupFolderDownloads
  };
}