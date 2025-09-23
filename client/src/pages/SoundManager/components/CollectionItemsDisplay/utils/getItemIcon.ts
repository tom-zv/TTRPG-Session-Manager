import { BsMusicNote, BsSoundwave, BsHeadphones } from "react-icons/bs";
import { AiTwotoneSound } from "react-icons/ai";
import { FaLeaf } from "react-icons/fa";
import { IconType } from 'react-icons';
import { AudioItem } from '../types.js';

export function getItemIcon(item: AudioItem): IconType {
  switch (item.type) {
    case 'file':
      return item.audioType === 'music' ? BsMusicNote : 
             item.audioType === 'sfx' ? BsSoundwave : AiTwotoneSound;
    case 'collection':
      return item.audioType === 'playlist' ? BsHeadphones :
             item.audioType === 'sfx' ? AiTwotoneSound :
             item.audioType === 'ambience' ? FaLeaf :
             AiTwotoneSound;
    default: return AiTwotoneSound;
  }
}