export type AudioItem = {
  id: number;
  title: string;
  type: 'file' | 'playlist' | 'sfx_set' | 'ambience_set' | 'pack';
  description?: string;
  duration?: number;
  audioType?: 'music' | 'sfx' | 'ambience';
  itemCount?: number;
  isCreateButton?: boolean;
};
