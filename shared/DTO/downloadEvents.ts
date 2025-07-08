import { SocketEvent } from "shared/sockets/types.js";
import { DownloadFileBase } from "./audio/files.js";

export type DownloadEventType =
  | "DownloadProgress"
  | "DownloadMetadata"
  | "DownloadItemError"
  | "DownloadJobError"
  | "DownloadComplete";

export type DownloadSocketEvent<P> = SocketEvent<DownloadEventType, P>;

/**
 * Progress update for a file download
 */
export interface DownloadProgressDTO<
  TFile extends DownloadFileBase = DownloadFileBase
> {
  jobId: string;
  fileIndex: number;
  totalFiles: number;
  downloadType: TFile["type"];
  file: TFile;
  timestamp: string;
}

/**
 * Download metadata including file count and optional details
 */
export interface DownloadMetadataDTO<
  T extends DownloadFileBase = DownloadFileBase
> {
  jobId: string;
  folderId: number;
  totalFiles?: number;
  totalSize?: number;
  estimatedTime?: number;
  downloadType: T["type"];
  timestamp: string;
}

/**
 * Error occurred while downloading a specific file
 */
export interface DownloadItemErrorDTO<
  T extends DownloadFileBase = DownloadFileBase
> {
  jobId: string;
  folderId: number;
  fileIndex: number;
  totalFiles: number;
  title?: string;
  url?: string;
  errorMessage: string;
  timestamp: string;
  downloadType: T["type"];
}

/**
 * Error occurred for the entire download job
 */
export interface DownloadJobErrorDTO<
  T extends DownloadFileBase = DownloadFileBase
> {
  jobId: string;
  folderId: number;
  errorMessage: string;
  timestamp: string;
  downloadType: T["type"];
}

/**
 * Download job has completed successfully
 */
export interface DownloadCompleteDTO<
  T extends DownloadFileBase = DownloadFileBase
> {
  jobId: string;
  folderId: number;
  timestamp: string;
  downloadType: T["type"]; 
  /** Contains the file data if the job was for a single file and it completed successfully.
   *  For batch/playlist downloads, this will typically be undefined. */
  file?: T;
}

export type AnyDownloadPayload =
  | DownloadProgressDTO
  | DownloadMetadataDTO
  | DownloadItemErrorDTO
  | DownloadJobErrorDTO
  | DownloadCompleteDTO;