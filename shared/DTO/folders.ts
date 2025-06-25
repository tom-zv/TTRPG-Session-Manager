import type { FolderType } from "shared/audio/types.js"

export interface FolderDTO {
  id: number;
  name: string;
  type: FolderType;
  parentId: number | null;
}