import { AudioFileDB } from "src/api/audio/types.js";

export interface ProgressMessage {
  type: 'progress';
  file: AudioFileDB;
  index: number;
  total: number;
}

export interface MetadataMessage {
  type: 'metadata';
  totalFiles: number;
  //estimatedTime?: number;
  //totalSize?: number;
}

export interface CompleteMessage {
  type: 'complete';
  jobId: string;
  file: AudioFileDB | undefined; // undefined for batch downloads like playlists
}

export interface ItemErrorMessage {
  type: 'item-error';
  index: number;
  total: number;
  error: string; 
  title?: string;
  url?: string;
}

export interface WorkerErrorMessage {
  type: 'error';
  jobId: string;
  error: ErrorDetails;
}

export interface ErrorDetails {
  message: string;
  name: string;
  stack?: string;
}
export type downloadWorkerMessage =
  | ProgressMessage
  | MetadataMessage
  | CompleteMessage
  | ItemErrorMessage
  | WorkerErrorMessage;
  