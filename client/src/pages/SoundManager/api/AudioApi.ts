import { AudioFile } from 'src/components/FolderTree/types.js';
import { Folder } from 'src/components/FolderTree/types.js';

const API_URL = '/api/audio';

export async function getAllAudioFiles(): Promise<AudioFile[]> {
  try {
    const response = await fetch(`${API_URL}/files`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching audio files:", error);
    throw error;
  }
}

export async function getAudioFile(id: number): Promise<AudioFile> {
  try {
    const response = await fetch(`${API_URL}/files/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching audio file with ID ${id}:`, error);
    throw error;
  }
}

export async function uploadAudioFile(audioData: Partial<AudioFile>, file?: File): Promise<number> {
  try {
    const formData = new FormData();
    formData.append('name', audioData.name || '');
    formData.append('type', audioData.audioType || '');
    
    if (audioData.fileUrl) {
      formData.append('file_url', audioData.fileUrl);
    }
    
    if (audioData.folderId) {
      formData.append('folder_id', audioData.folderId.toString());
    }
    
    if (file) {
      formData.append('audioFile', file);
    }

    const response = await fetch(`${API_URL}/files`, {
      method: 'POST',
      body: formData,
      // Do not set Content-Type header when sending FormData
    });

    if(!response.ok){
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  }
  catch(error){
    console.error("error uploading audio file:", error);
    throw error;
  }
}

export async function initiateScan(): Promise<number> {
  try {
    const response = await fetch(`${API_URL}/files/scan`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error initiating scan:", error);
    throw error;
  }
}

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

export default {
    getAllAudioFiles,
    getAudioFile,
    uploadAudioFile,
    initiateScan,
    getAllFolders
}