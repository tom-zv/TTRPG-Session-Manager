import { Folder } from 'src/pages/SoundManager/components/FolderTree/types.js';

const API_URL = '/api/audio';

export async function getAllFolders(): Promise<Folder[]> {
  try {
    const response = await fetch(`${API_URL}/folders`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching folders:", error);
    throw error;
  }
}

export async function createFolder(name: string, parentFolderId: number, folderType: string): Promise<Folder> {
  try {
    const response = await fetch(`${API_URL}/folders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, parentFolderId, folderType })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
}

export default {
  getAllFolders
};