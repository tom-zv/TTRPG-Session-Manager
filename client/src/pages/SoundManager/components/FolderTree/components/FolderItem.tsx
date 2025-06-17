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
          className: `folder-item ${dropAreaProps.className || ""}`,
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
          <ul className="folder-children">
            {/* Render subfolders first */}
            {hasChildren && folder.children && (
              <FolderDisplay folders={folder.children} level={level + 1} />
            )}

            {/* Add separator if we have both children and files */}
            {hasChildren && hasFiles && <li className="folder-separator"></li>}

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
                      className="download-status"
                    >
                      {/*
                        If the job has a jobError, show a job‐level error block
                      */}
                      {progress.jobError ? (
                        <div className="job-error">
                          <div className="error-header">
                            <i className="fas fa-exclamation-triangle"></i>
                            <span>Download job failed</span>
                            <button
                              className="retry-button"
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
                              className="dismiss-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissDownloadProgress(jobId, folder.id);
                              }}
                            >
                             <FaCheck />
                            </button>
                          </div>
                          <div className="folder-error-text">
                            {progress.jobError.message}
                          </div>
                        </div>
                      ) : progress.fileErrors &&
                        progress.fileErrors.length > 0 ? (
                        <div className="file-errors">
                          <div className="error-header">
                            <span>
                              {progress.fileErrors.length} file(s) failed to
                              download
                            </span>
                            <button
                              className="retry-button"
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
                              className="toggle-details-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleErrorDetails(jobId);
                              }}
                            >
                              {showDetails ? "Hide Details" : "Show Details"}
                            </button>
                            <button
                              className="dismiss-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissDownloadProgress(jobId, folder.id);
                              }}
                            >
                              <FaCheck />
                            </button>
                          </div>

                          {showDetails && (
                            <ul className="error-list">
                              {progress.fileErrors!.map((error, index) => (
                                <li
                                  key={`error-${jobId}-${index}`}
                                  className="error-item"
                                >
                                  <div className="error-file-info">
                                    {error.title ? (
                                      <span className="error-file-name">
                                        {error.title}
                                      </span>
                                    ) : (
                                      <span className="error-file-name">
                                        Unknown file
                                      </span>
                                    )}
                                    {error.url && (
                                      <span className="error-file-url">
                                        {error.url}
                                      </span>
                                    )}
                                  </div>
                                  <div className="folder-error-text">
                                    {error.message}
                                  </div>
                                  <button
                                    className="retry-file-button"
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
                        <div className="download-complete">
                          <div className="complete-header">
                            <i className="fas fa-check-circle"></i>
                            <span>Download complete</span>

                            <button
                              className="dismiss-button"
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
                        <span className="download-progress">
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
