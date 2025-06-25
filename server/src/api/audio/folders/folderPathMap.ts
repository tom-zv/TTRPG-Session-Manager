import path from "path";
import { getAllFolders } from "./folderService.js";
import { FolderDB } from "../types.js";

export interface FolderInfo extends FolderDB {
  found?: boolean;
}

export async function buildPathToFolderMap(): Promise<Map<string, FolderInfo>> {

  const folders = await getAllFolders();
  const folderById: Record<number, FolderDB> = Object.fromEntries(
    folders.map((folder) => [folder.id, folder])
  );

  const pathCache = new Map<number, string>();

  function buildPath(id: number): string {
    if (pathCache.has(id)) return pathCache.get(id)!;

    const folder = folderById[id];

    if (!folder) throw new Error(`Folder ${id} not found`);

    const p =
      folder.parent_id === null
        ? folder.name
        : path.join(buildPath(folder.parent_id), folder.name);

    pathCache.set(id, p);
    return p;
  }

  return new Map(
    folders.map(folder => [buildPath(folder.id), folder])
  )
}
