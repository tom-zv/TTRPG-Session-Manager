// File-specific types
export type AudioFileType = "music" | "sfx" | "ambience";

// Collection-specific types
export type CollectionType = "playlist" | "sfx" | "ambience" | "pack";

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
  fileType: AudioFileType;
  duration?: number;
  volume?: number;
  delay?: number; // For macro timing
  fileUrl?: string;
  filePath?: string;
  folderId?: number;
  addedAt?: string;
  active?: boolean; // Whether the file is active in a collection
}

// Collection specific interface
export interface AudioCollection extends AudioItemBase {
  type: CollectionType;
  description?: string;
  itemCount?: number;
  items?: AudioItem[]; // For nested collections or when files are loaded
}

export interface AudioMacro extends AudioItemBase {
  type: "macro";
  description?: string;
  itemCount?: number;
  items?: AudioFile[]; // For nested collections or when files are loaded
  duration?: number; // Total duration of the macro
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
