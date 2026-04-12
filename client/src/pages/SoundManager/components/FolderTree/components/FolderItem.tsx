import React, { useState } from "react";
import { Folder } from "../types.js";
import { handleFolderClick } from "../utils/ClickHandlers.js";
import { useDropTarget } from "../../../../../hooks/useDropTarget.js";
import FolderHeader from "./FolderHeader.js";
import FileDisplay from "./FileDisplay.js";
import FolderDisplay from "./FolderDisplay.js";
import { useFolderTree } from "../context/FolderTreeContext.js";
import { DownloadProgress } from "../hooks/useDownloadProgress.js";
import { FaCheck } from "react-icons/fa";
import styles from "../FolderTree.module.css";


interface FolderItemProps {
  folder: Folder;
  level?: number;
  downloadProgress?: Record<string, DownloadProgress>;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  level = 0,
  downloadProgress,
}) => {

  const [isOpen, setIsOpen] = useState(level === 0); // Auto-expand root level
  const [showErrorDetailsMap, setShowErrorDetailsMap] = useState<
    Record<string, boolean>
  >({});

  const { dismissDownloadProgress } = useFolderTree();

  const hasChildren = folder.children && folder.children.length > 0;
  const hasFiles = folder.files ? folder.files.length > 0 : false;

  // Custom hook for drag-and-drop functionality
  const { dropAreaProps } = useDropTarget({
    acceptedTypes: ["folder", "file"],
    onItemsDropped: async (items, context) => {
      console.log("Dropped items:", items);
      console.log("Drop context:", context);
      console.log("Dropped on folder:", folder);
    },
  });

  /**
   * Toggle detail‐view for a specific jobId
   */
  const toggleErrorDetails = (jobId: string) => {
    setShowErrorDetailsMap((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }));
  };

  return (
    <li>
      <div
        {...{
          ...dropAreaProps,
          className: `${styles.folderItem} ${dropAreaProps.className || ""}`,
        }}
      >
        <FolderHeader
          folder={folder}
          isOpen={isOpen}
          hasContents={hasChildren || hasFiles}
          onClick={(e) => handleFolderClick(e, folder, isOpen, setIsOpen)}
          setIsOpen={setIsOpen}  // Add this line to pass the setter
        />

        {isOpen && (
            <ul className={styles.folderChildren}>
            {/* Render subfolders first */}
            {hasChildren && folder.children && (
              <FolderDisplay folders={folder.children} level={level + 1} />
            )}

            {/* Add separator if we have both children and files */}
            {hasChildren && hasFiles && <li className={styles.folderSeparator}></li>}

            {hasFiles &&
              folder.files!.map((file) => (
                <FileDisplay key={`file-${file.id}`} file={file} />
              ))}

            {/*
              Now iterate over each download job (if any) for this folder:
              “downloadProgress” is a map: jobId → DownloadProgress
            */}
            {downloadProgress &&
              Object.entries(downloadProgress).map(
                ([jobId, progress]) => {
                  const showDetails = showErrorDetailsMap[jobId] || false;

                  return (
                    <div
                      key={`download-job-${jobId}`}
                        className={styles.downloadStatus}
                    >
                      {/*
                        If the job has a jobError, show a job‐level error block
                      */}
                      {progress.jobError ? (
                          <div className={styles.jobError}>
                            <div className={styles.errorHeader}>
                            <i className="fas fa-exclamation-triangle"></i>
                            <span>Download job failed</span>
                            <button
                                className={styles.retryButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log(
                                  "Retrying download job for folder:",
                                  folder.id,
                                  "jobId:",
                                  jobId
                                );
                                // TODO: Implement retry job logic
                              }}
                            >
                              Retry All
                            </button>
                            <button
                                className={styles.dismissButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissDownloadProgress(jobId, folder.id);
                              }}
                            >
                             <FaCheck />
                            </button>
                          </div>
                            <div className={styles.folderErrorText}>
                            {progress.jobError.message}
                          </div>
                        </div>
                      ) : progress.fileErrors &&
                        progress.fileErrors.length > 0 ? (
                          <div className={styles.fileErrors}>
                            <div className={styles.errorHeader}>
                            <span>
                              {progress.fileErrors.length} file(s) failed to
                              download
                            </span>
                            <button
                                className={styles.retryButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log(
                                  "Retrying all failed files for folder:",
                                  folder.id,
                                  "jobId:",
                                  jobId
                                );
                                // TODO: Implement retry all files logic
                              }}
                            >
                              Retry All
                            </button>
                            <button
                                className={styles.toggleDetailsButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleErrorDetails(jobId);
                              }}
                            >
                              {showDetails ? "Hide Details" : "Show Details"}
                            </button>
                            <button
                                className={styles.dismissButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissDownloadProgress(jobId, folder.id);
                              }}
                            >
                              <FaCheck />
                            </button>
                          </div>

                          {showDetails && (
                              <ul className={styles.errorList}>
                              {progress.fileErrors!.map((error, index) => (
                                <li
                                  key={`error-${jobId}-${index}`}
                                    className={styles.errorItem}
                                >
                                    <div className={styles.errorFileInfo}>
                                    {error.title ? (
                                        <span className={styles.errorFileName}>
                                        {error.title}
                                      </span>
                                    ) : (
                                        <span className={styles.errorFileName}>
                                        Unknown file
                                      </span>
                                    )}
                                    {error.url && (
                                        <span className={styles.errorFileUrl}>
                                        {error.url}
                                      </span>
                                    )}
                                  </div>
                                    <div className={styles.folderErrorText}>
                                    {error.message}
                                  </div>
                                  <button
                                      className={styles.retryFileButton}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log(
                                        "Retrying file:",
                                        error.title,
                                        error.url,
                                        "jobId:",
                                        jobId
                                      );
                                      // TODO: Implement retry single file logic
                                    }}
                                  >
                                    Retry
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : progress.complete ? (
                          <div className={styles.downloadComplete}>
                            <div className={styles.completeHeader}>
                            <i className="fas fa-check-circle"></i>
                            <span>Download complete</span>

                            <button
                                className={styles.dismissButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissDownloadProgress(jobId, folder.id);
                              }}
                            >
                              <FaCheck />
                            </button>
                          </div>
                          {/* <div className="complete-message">
                            Successfully downloaded {progress.total} files to folder &quot;{folder.name}&quot;
                          </div> */}
                        </div>
                      ) : (
                          <span className={styles.downloadProgress}>
                          Downloading {progress.index}/{progress.total}...
                        </span>
                      )}
                    </div>
                  );
                }
              )}
          </ul>
        )}
      </div>
    </li>
  );
};

export default FolderItem;
