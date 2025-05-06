import { AudioFile } from 'src/pages/SoundManager/components/FolderTree/types.js';

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

export async function createAudioFile(audioData: Partial<AudioFile>, file?: File): Promise<number> {
  try {
    const formData = new FormData();
    formData.append('name', audioData.name || '');
    formData.append('type', audioData.audioType || 'any');
    
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
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const result = await response.json();
    return result.id; // Extract the ID from the response
  }
  catch (error) {
    console.error("Error uploading audio file:", error);
    throw error;
  }
}

export async function updateAudioFile(id: number, audioData: Partial<AudioFile>): Promise<number> {
  try {
    const params: Record<string, string> = {};
    
    if (audioData.name) {
      params.name = audioData.name;
    }
    if (audioData.filePath) {
      params.file_path = audioData.filePath;
    }
    if (audioData.fileUrl) {
      params.file_url = audioData.fileUrl;
    }
    
    const response = await fetch(`${API_URL}/files/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error updating audio file with ID ${id}:`, error);
    throw error;
  }
}

export default {
  getAllAudioFiles,
  getAudioFile,
  createAudioFile,
  updateAudioFile
};