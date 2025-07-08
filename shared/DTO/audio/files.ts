import { AudioType } from "shared/audio/types.js";

// Base file definitions for downloadable content
export interface DownloadFileBase {
  id: number;
  name: string;
  url?: string;
  path?: string;
  addedAt: string;
  type: "audio" | "image" | "document";
}

export interface AudioFileDTO extends DownloadFileBase {
  type: "audio";
  folderId: number;
  audioType: AudioType;
  duration: number;
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