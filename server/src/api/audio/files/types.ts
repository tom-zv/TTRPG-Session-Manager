import { AudioType } from "shared/audio/types.js";

export interface AudioFileDB {
  audio_file_id: number;
  name: string | null; 
  audio_type: AudioType; 
  duration: number | null; 
  file_url: string | null;
  file_path: string | null;
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
  macro_id: number;
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
  collection_id: number;
  name: string;
  description: string | null;
  type: "playlist" | "sfx" | "ambience";
  // Computed/aggregated fields
  item_count?: number; 
  position?: number;
}

export interface FolderDB {
  folder_id: number;
  name: string;
  parent_folder_id: number | null;
  folder_type: "music" | "sfx" | "ambience" | "root" | "any";
  created_at?: string; 
}