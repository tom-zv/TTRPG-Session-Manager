import { AudioFile } from 'shared/types/audio.js';

const API_URL = '/api';

export async function getAllAudioFiles(): Promise<AudioFile[]> {
  try {
    const response = await fetch(`${API_URL}/audio`);
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
    const response = await fetch(`${API_URL}/audio/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching audio file with ID ${id}:`, error);
    throw error;
  }
}

export default {
    getAllAudioFiles,
    getAudioFile
}