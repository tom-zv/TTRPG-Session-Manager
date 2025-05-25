import { AudioFileDTO } from './files.js';

export type CollectionType = 'playlist' | 'sfx' | 'ambience' | 'pack' | 'macro';

export interface AudioCollectionDTO {
  id: number;
  type: CollectionType;
  name: string;
  description?: string;
  itemCount?: number;
  position?: number;
  items?: (AudioFileDTO | AudioMacroDTO)[];
}

export interface AudioMacroDTO extends AudioCollectionDTO {
  type: 'macro';
  duration?: number;
  volume?: number;
}