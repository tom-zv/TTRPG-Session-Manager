import { AudioItem } from '../types.js';

export function getItemIcon(item: AudioItem): string {
  switch (item.type) {
    case 'file':
      return item.audioType === 'music' ? '🎵' : 
             item.audioType === 'sfx' ? '🔊' : '🔈';
    case 'playlist': return '';
    case 'sfx_set': return '';
    case 'ambience_set': return '';
    case 'pack': return '📦';
    default: return '📄';
  }
}