export type AudioItemType = "file" | "macro" | "playlist" | "sfx" | "ambience" | "pack";
export type AudioFileType = "music" | "sfx" | "ambience";

export interface AudioItem {
  // Core data properties
  id: number;
  name: string;
  type: AudioItemType;
  
  // Optional metadata
  description?: string;
  duration?: number;
  position?: number;
  fileType?: AudioFileType;
  itemCount?: number;
  
  // UI-specific flags (consider moving to a separate type)
  isCreateButton?: boolean;
}
