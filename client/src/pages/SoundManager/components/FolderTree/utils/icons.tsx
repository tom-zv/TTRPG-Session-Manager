import { FaFolderOpen } from "react-icons/fa6";
import { PiFolderOpenLight } from "react-icons/pi";
import { FaFolderClosed } from "react-icons/fa6";
import { IoFolderOutline } from "react-icons/io5";
import { IoLeafOutline } from "react-icons/io5";
import { MdMusicNote } from "react-icons/md";




export const getFolderIcon = (folderType: string, isOpen: boolean, hasContents: boolean) => {
  if (!hasContents) {
    if (isOpen) {
      return <PiFolderOpenLight />;
    } else return <IoFolderOutline />;
    
  }
  
  if (isOpen) {
    return <FaFolderOpen/>;
    // Uncomment for folder type specific icons
    // switch (folderType) {
    //   case 'music': return '🎵';
    //   case 'sfx': return '🔊';
    //   case 'ambience': return '🌫️';
    //   default: return '📂';
    // }
  } else {
    return <FaFolderClosed/>;
    // Uncomment for folder type specific icons
    // switch (folderType) {
    //   case 'music': return '🎵';
    //   case 'sfx': return '🔊';
    //   case 'ambience': return '🌫️';
    //   default: return '📁';
    // }
  }
};

export const getFileIcon = (fileType: string) => {
  switch (fileType) {
    case 'music': return <MdMusicNote />;
    case 'sfx': return '🔉';
    case 'ambience': return <IoLeafOutline />;
    default: return '📄';
  }
};