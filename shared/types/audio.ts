export type AudioFile = {
  id: number;
  title: string;
  audioType: 'music' | 'sfx' | 'ambience';
  duration?: number;
  fileUrl?: string;
  filePath?: string;
  folderId?: number;
  addedAt?: string;
}
