export interface FolderDTO {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
}