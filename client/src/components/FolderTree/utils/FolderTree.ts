import { Folder } from "shared/types/folder.js";

export const buildFolderTree = (flatFolders: Folder[]): Folder[] => {
  const folderMap = new Map<number, Folder>();

  // First, create a map of all folders with empty children arrays
  flatFolders.forEach((folder) => {
    folderMap.set(folder.folder_id, { ...folder, children: [] });
  });

  // Root folders (those with no parent)
  const rootFolders: Folder[] = [];

  // Add children to their parents
  flatFolders.forEach((folder) => {
    if (folder.parent_folder_id === null) {
      // Root folder
      rootFolders.push(folderMap.get(folder.folder_id)!);
    } else {
      // Child folder - add to parent's children array
      const parent = folderMap.get(folder.parent_folder_id);
      if (parent && parent.children) {
        parent.children.push(folderMap.get(folder.folder_id)!);
      }
    }
  });

  return rootFolders;
};

