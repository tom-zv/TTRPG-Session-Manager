import { SocketEvent } from "shared/sockets/types.js";
// Base
export interface DownloadFileBase {
  id: number;
  name: string;
  folderId: number;
  url?: string;
  path?: string;
  addedAt?: string;
  type: 'audio' | 'image' | 'document';
}

export interface AudioFileDTO extends DownloadFileBase {
  type: "audio"
  audioType: string;
  duration: number;
  url?: string;
  path?: string;
  addedAt?: string;
  delay?: number;
  volume?: number;
  position?: number;
  active?: boolean;
}

export interface ImageFileDTO extends DownloadFileBase {
  type: "image";
  width: number;
  height: number;
  format?: string;
}

export interface DocumentFileDTO extends DownloadFileBase {
  type: "document";
  mimeType: string;
  pageCount?: number;
}

export type AnyDownloadFileDTO = AudioFileDTO | ImageFileDTO | DocumentFileDTO;

export type DownloadEventType =
  | "DownloadProgress"
  | "DownloadMetadata"
  | "DownloadItemError"
  | "DownloadJobError"

export type DownloadSocketEvent<P> = SocketEvent<DownloadEventType, P>;

export interface DownloadProgressDTO<
  TFile extends DownloadFileBase = DownloadFileBase,
> {
  jobId: string;
  fileIndex: number;
  totalFiles: number;
  file: TFile;
  downloadType: TFile["type"];
}

/**
 * Download metadata including file count and optional details
 */
export interface DownloadMetadataDTO<
  TFile extends DownloadFileBase = DownloadFileBase,
> {
  jobId: string;
  totalFiles?: number;
  totalSize?: number;
  estimatedTime?: number;
  downloadType: TFile["type"];
}

export interface DownloadItemErrorDTO<
  TFile extends DownloadFileBase = DownloadFileBase,
> {
  jobId: string;
  errorMessage: string;
  fileIndex: number;
  totalFiles: number;
  // Metadata
  folderId: number;
  title?: string;
  url?: string;
  downloadType: TFile["type"];
}

export interface DownloadJobErrorDTO<
  T extends DownloadFileBase = DownloadFileBase,
> {
  jobId: string;
  folderId: number;
  errorMessage: string;
  timestamp: string;
  downloadType: T["type"];
}

