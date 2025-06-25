
const API_URL = '/api/audio';

export async function scanAudioLibrary() {
  try {
    const response = await fetch(`${API_URL}/files/scan`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return { success: true }

  } catch (error) {
    console.error("Error initiating scan:", error);
    return { success: false }
  }
}

export async function getYTAudioURL(videoUrl: string): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/youtube-audio?url=${encodeURIComponent(videoUrl)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    return data.audioUrl;
  } catch (error) {
    console.error("Error fetching YouTube audio:", error);
    throw error;
  }
}

export default {
  scanAudioLibrary,
  getYTAudioURL
};