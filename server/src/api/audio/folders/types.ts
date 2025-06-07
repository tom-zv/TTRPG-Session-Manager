import { AudioFolderType } from "../types.js";

export interface FolderDB {
    id: number;
    name: string;
    folder_type: AudioFolderType;
    parent_id: number;
  }