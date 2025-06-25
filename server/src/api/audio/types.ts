import type { AudioType, FolderType } from "shared/audio/types.js"

export interface AudioFileDB {
  id: number;
  name: string; 
  audio_type: AudioType; 
  duration: number | null; 
  url: string | null;
  rel_path: string | null;
  folder_id: number;
  added_at: string; 
}

export interface MacroFileDB extends AudioFileDB {
  delay: number;
  volume: number;
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
  files?: string | null; 
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
  folder_type: FolderType;
  created_at: string; 
}