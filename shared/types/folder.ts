export interface Folder {
    id: number;
    name: string;
    type: string;
    parentId: number;
    children?: Folder[];
  }
  