import { BsMusicNote, BsSoundwave, BsHeadphones, BsBox } from "react-icons/bs";
import { AiTwotoneSound } from "react-icons/ai";
import { FaLeaf } from "react-icons/fa";
import { IconType } from 'react-icons';
import { AudioItem } from '../types.js';

export function getItemIcon(item: AudioItem): IconType {
  switch (item.type) {
    case 'file':
      return item.fileType === 'music' ? BsMusicNote : 
             item.fileType === 'sfx' ? BsSoundwave : AiTwotoneSound;
    case 'playlist': return BsHeadphones;
    case 'sfx': return AiTwotoneSound;
    case 'ambience': return FaLeaf;
    case 'pack': return BsBox;
    default: return AiTwotoneSound;
  }
}