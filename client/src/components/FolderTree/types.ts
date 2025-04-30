export type AudioFile = {
    id: number;
    name: string;
    audioType: 'music' | 'sfx' | 'ambience';
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
    type: string;
    parentId: number;
    children?: Folder[];
  }
  