import { AudioFileUI } from 'src/pages/SoundManager/components/FolderTree/types.js';

const API_URL = '/api/audio';

export async function getAllAudioFiles(): Promise<AudioFileUI[]> {
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

export async function getAudioFile(id: number): Promise<AudioFileUI> {
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

export async function createAudioFile(audioData: Partial<AudioFileUI>, file?: File): Promise<{jobId?: string, id?: number}> {
  const formData = new FormData();
  formData.append('name', audioData.name || '');
  formData.append('type', audioData.audioType || 'any');
  
  if (audioData.url) {
    formData.append('file_url', audioData.url);
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

  if (result.id) return {id: result.id}

  else if (response.status === 202){  
    return {jobId: result.jobId};
  }

  return {id: -1}
}

export async function updateAudioFile(id: number, audioData: Partial<AudioFileUI>): Promise<number> {
  try {
    const params: Record<string, string> = {};
    
    if (audioData.name) {
      params.name = audioData.name;
    }
    if (audioData.path) {
      params.file_path = audioData.path;
    }
    if (audioData.url) {
      params.file_url = audioData.url;
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