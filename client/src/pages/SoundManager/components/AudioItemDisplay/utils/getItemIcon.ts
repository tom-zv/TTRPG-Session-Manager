import { AudioItem } from '../types.js';

export function getItemIcon(item: AudioItem): string {
  switch (item.type) {
    case 'file':
      return item.fileType === 'music' ? '🎵' : 
             item.fileType === 'sfx' ? '🔊' : '🔈';
    case 'playlist': return '';
    case 'sfx': return '';
    case 'ambience': return '';
    case 'pack': return '📦';
    default: return '📄';
  }
}