import { AudioType, FolderType } from "shared/audio/types.js";

export interface AudioFileUI {
  id: number;
  name: string;
  audioType: AudioType;
  folderId: number;
  duration?: number;
  url?: string;
  path?: string;
  addedAt?: string;
}
  
export interface Folder {
  id: number;
  name: string;
  type: FolderType;
  parentId: number;
  children?: Folder[];
  files?: AudioFileUI[];
}
