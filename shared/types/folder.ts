export interface Folder {
    folder_id: number;
    name: string;
    parent_folder_id: number;
    folder_type: string;
    children?: Folder[];
  }
  