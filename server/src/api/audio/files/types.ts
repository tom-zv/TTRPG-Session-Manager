import type { AudioType, AudioFolderType } from "../types.js";


export interface AudioFileDB {
  id: number;
  name: string | null; 
  audio_type: AudioType; 
  duration: number | null; 
  url: string | null;
  rel_path: string | null;
  folder_id: number;
  added_at: string; 
}

export interface CollectionAudioFileDB extends AudioFileDB {
  volume: number; 
  position: number;
  active: boolean; 
  collection_id: number; 
  delay?: number; 
}

export interface MacroDB {
  id: number;
  name: string;
  description: string | null;
  volume: number; 
  created_at?: string; 
  // Computed/aggregated fields
  position?: number; 
  item_count?: number; 
  files?: string; 
}

export interface CollectionDB {
  id: number;
  name: string;
  description: string | null;
  type: "playlist" | "sfx" | "ambience";
  // Computed/aggregated fields
  item_count?: number; 
  position?: number;
}

export interface FolderDB {
  id: number;
  name: string;
  parent_id: number | null;
  folder_type: AudioFolderType;
  created_at?: string; 
}