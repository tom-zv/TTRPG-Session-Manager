import { AudioFileDTO } from './files.js';

export interface AudioCollectionDTO {
  id: number;
  type: 'collection' | 'macro' ;
  name: string;
  audioType: 'playlist' | 'sfx' | 'ambience';
  description?: string;
  imagePath?: string; 
  itemCount?: number;
  position?: number;
  items?: (AudioFileDTO | AudioMacroDTO)[];
  createdAt: string;
}

export interface AudioMacroDTO extends AudioCollectionDTO {
  type: 'macro';
  duration?: number;
  volume?: number;
}