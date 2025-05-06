
export type AudioType = 'music' | 'sfx' | 'ambience' | 'any';
export type FolderType = 'music' | 'sfx' | 'ambience' | 'root' | 'any';

export type AudioFile = {
    id: number;
    name: string;
    audioType: AudioType;
    duration?: number;
    playOrder: number;
    fileUrl?: string;
    filePath?: string;
    folderId?: number;
    addedAt?: string;
  }
  
  export interface Folder {
    id: number;
    name: string;
    type: FolderType;
    parentId: number;
    children?: Folder[];
    files?: AudioFile[];
  }
  