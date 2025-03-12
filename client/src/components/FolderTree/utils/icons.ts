export const getFolderIcon = (folderType: string, isOpen: boolean, hasContents: boolean) => {
  if (!hasContents) {
    return '-';
  }
  
  if (isOpen) {
    return '📂';
    // Uncomment for folder type specific icons
    // switch (folderType) {
    //   case 'music': return '🎵';
    //   case 'sfx': return '🔊';
    //   case 'ambience': return '🌫️';
    //   default: return '📂';
    // }
  } else {
    return '📁';
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
    case 'music': return '♪';
    case 'sfx': return '🔉';
    case 'ambience': return '🌧️';
    default: return '📄';
  }
};