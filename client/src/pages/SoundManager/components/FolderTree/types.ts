export type AudioType = 'music' | 'sfx' | 'ambience' | 'any';
export type FolderType = 'music' | 'sfx' | 'ambience' | 'root' | 'any';

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
