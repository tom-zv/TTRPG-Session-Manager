import { AudioType, CollectionType } from "shared/audio/types.js";

// Base interface with common properties
export interface AudioItemBase {
  id: number;
  name: string;
  position?: number; // Position within a collection/pack
  isCreateButton?: boolean; // Special item for creating a new item
}

// Audio file specific interface
export interface AudioFile extends AudioItemBase {
  type: "file";
  audioType: AudioType;
  duration: number;
  volume?: number;
  delay?: number;
  url?: string;
  path?: string;
  folderId?: number;
  addedAt?: string;
  active?: boolean; 
}

// Collection specific interface
export interface AudioCollection<T extends AudioItem = AudioItem> extends AudioItemBase {
  type: CollectionType;
  imageUrl?: string;
  description?: string;
  itemCount?: number;
  items?: T[]; 
}

export interface AudioMacro extends AudioCollection {
  type: "macro";
  duration?: number; 
  volume?: number; 
}

// Union type
export type AudioItem = AudioFile | AudioCollection | AudioMacro;

// Type guards to check which type an AudioItem is
export function isAudioFile(item: AudioItem): item is AudioFile {
  return item.type === "file";
}

export function isAudioCollection(item: AudioItem): item is AudioCollection {
  return item.type !== "file";
}

export function isAudioMacro(item: AudioItem): item is AudioMacro {
  return item.type === "macro";
}

export function isPlaylistCollection(item: AudioItem): item is AudioCollection {
  return item.type === "playlist";
}

export function isSfxCollection(item: AudioItem): item is AudioCollection {
  return item.type === "sfx";
}

export function isAmbienceCollection(item: AudioItem): item is AudioCollection {
  return item.type === "ambience";
}

export function isMacroCollection(item: AudioItem): item is AudioCollection {
  return item.type === "macro";
}

export function isPackCollection(item: AudioItem): item is AudioCollection {
  return item.type === "pack";
}
