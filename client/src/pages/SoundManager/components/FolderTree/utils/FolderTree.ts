import { Folder } from "src/pages/SoundManager/components/FolderTree/types.js";
import { AudioFile } from "src/pages/SoundManager/components/FolderTree/types.js";

export const buildFolderTree = (flatFolders: Folder[], audioFiles: AudioFile[]): Folder[] => {
  const folderMap = new Map<number, Folder>();

  // Initialize folders with empty children and files arrays
  flatFolders.forEach((folder) => {
    folderMap.set(folder.id, { ...folder, children: [], files: [] });
  });

  const rootFolders: Folder[] = [];

  flatFolders.forEach((folder) => {
    const mappedFolder = folderMap.get(folder.id)!;
    mappedFolder.files = audioFiles.filter(file => file.folderId === folder.id);

    if (folder.parentId === null) {
      rootFolders.push(mappedFolder);
    } else {
      const parent = folderMap.get(folder.parentId);
      if (parent) {
        parent.children?.push(mappedFolder);
      }
    }
  });

  return rootFolders;
};


