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
