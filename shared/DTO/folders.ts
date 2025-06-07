import type { AudioFolderType } from "../../server/src/api/audio/types.js"

export interface FolderDTO {
  id: number;
  name: string;
  type: AudioFolderType;
  parentId: number | null;
}