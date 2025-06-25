import { AudioType } from "shared/audio/types.js";
import { AudioFileUI } from "src/pages/SoundManager/components/FolderTree/types.js";

const API_URL = "/api/audio";

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

/**
 * Upload one or multiple audio files to the server
 * @param files - Single file or array of files to upload
 * @param metadata - Metadata for each file (single object or array matching files)
 * @returns Response with success status
 */
export async function uploadAudioFiles(
  files: File | File[],
  metadata: {
    name: string;
    folderId?: number;
    audioType?: AudioType;
  }
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const formData = new FormData();
    const fileArray = Array.isArray(files) ? files : [files];

    // Validate input
    if (fileArray.length === 0) {
      return { success: false, error: "No files provided" };
    }

    // Add metadata that applies to all files
    if (metadata.name) {
      formData.append("name", metadata.name);
    }

    if (metadata.audioType) {
      formData.append("audioType", metadata.audioType);
    }

    if (metadata.folderId) {
      formData.append("folder_id", metadata.folderId.toString());
    }

    // Add files to form data
    fileArray.forEach((file) => {
      formData.append("files", file);
    });


    // Send request
    const response = await fetch(`${API_URL}/files/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error uploading audio files:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Type for URL download data
 */
export interface AudioUrlDownloadData {
  name: string;
  url: string;
  folderId: number;
  audioType?: AudioType;
}

/**
 * Type for download response
 */
export interface DownloadResponse {
  success: boolean;
  jobIds?: string[];
  error?: string;
}

/**
 * Download one or multiple audio files from URLs
 * @param downloadData - Single download data object or array of download data objects
 * @returns Response with success status and job IDs for downloads
 */
export async function downloadAudioUrls(
  downloadData: AudioUrlDownloadData | AudioUrlDownloadData[]
): Promise<DownloadResponse> {
  try {
    const downloadDataArray = Array.isArray(downloadData)
      ? downloadData
      : [downloadData];

    // Validate input
    if (downloadDataArray.length === 0) {
      return { success: false, error: "No URL data provided" };
    }

    // Format data for backend
    const formattedData = downloadDataArray.map((item) => ({
      name: item.name,
      folder_id: item.folderId,
      url: item.url,
      audio_type: item.audioType,
    }));

    // Always use the same structure regardless of count
    const requestBody = { files: formattedData };

    // Send request
    const response = await fetch(`${API_URL}/files/download-urls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();

    // Return job IDs
    return {
      success: true,
      jobIds: result.jobIds,
    };

  } catch (error) {
    console.error("Error downloading audio URLs:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function updateAudioFile(
  id: number,
  audioData: Partial<AudioFileUI>
): Promise<number> {
  try {
    const params: Record<string, string> = {};

    if (audioData.name) {
      params.name = audioData.name;
    }
    if (audioData.path) {
      params.rel_path = audioData.path;
    }
    if (audioData.url) {
      params.url = audioData.url;
    }

    const response = await fetch(`${API_URL}/files/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
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
  uploadAudioFiles,
  downloadAudioUrls,
  updateAudioFile,
};
