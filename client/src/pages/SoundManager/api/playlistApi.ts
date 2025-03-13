import { AudioItem } from '../types/AudioItem.js';

const API_URL = '/api/audio/playlists';

export interface Playlist {
  playlist_id: number;
  name: string;
  description: string | null;
  files?: AudioItem[];
}

// Get all playlists
export async function getAllPlaylists(): Promise<AudioItem[]> {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const playlists: Playlist[] = await response.json();
    
    return playlists.map(playlist => ({
      id: playlist.playlist_id,
      title: playlist.name,
      description: playlist.description || undefined,
      type: 'playlist' as const,
      itemCount: playlist.files?.length
    }));
  } catch (error) {
    console.error("Error fetching playlists:", error);
    throw error;
  }
}

// Get a playlist by ID, optionally with its files
export async function getPlaylistById(id: number, includeFiles: boolean = true): Promise<Playlist> {
  try {
    const response = await fetch(`${API_URL}/${id}?includeFiles=${includeFiles}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching playlist with ID ${id}:`, error);
    throw error;
  }
}

// Create a new playlist
export async function createPlaylist(name: string, description?: string): Promise<number> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const result = await response.json();
    return result.playlist_id;
  } catch (error) {
    console.error("Error creating playlist:", error);
    throw error;
  }
}

// Update an existing playlist
export async function updatePlaylist(id: number, name: string, description?: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error updating playlist ${id}:`, error);
    throw error;
  }
}

// Delete a playlist
export async function deletePlaylist(id: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error deleting playlist ${id}:`, error);
    throw error;
  }
}

// Get files in a playlist
export async function getPlaylistFiles(playlistId: number): Promise<AudioItem[]> {
  try {
    const playlist = await getPlaylistById(playlistId, true);
    
    if (!playlist.files) {
      return [];
    }
    
    // Convert to AudioItem format for AudioItemList component
    return playlist.files.map(file => ({
      id: file.id,
      title: file.title,
      type: 'file',
      audioType: file.audioType as 'music' | 'sfx' | 'ambience'
    }));
  } catch (error) {
    console.error(`Error fetching files for playlist ${playlistId}:`, error);
    throw error;
  }
}

// Get audio files that can be added to a playlist
export async function getAvailableAudioFiles(playlistId?: number): Promise<AudioItem[]> {
  try {
    // First get all audio files
    const response = await fetch('/api/audio/files');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const allFiles = await response.json();
    let playlistFiles: any[] = [];
    
    // If we have a playlist ID, get its files to exclude them
    if (playlistId) {
      const playlist = await getPlaylistById(playlistId, true);
      playlistFiles = playlist.files || [];
    }
    
    // Filter out files that are already in the playlist
    const playlistFileIds = new Set(playlistFiles.map(file => file.audio_file_id));
    const availableFiles = allFiles.filter((file: any) => !playlistFileIds.has(file.audio_file_id));
    
    // Convert to AudioItem format
    return availableFiles.map((file: any) => ({
      id: file.audio_file_id,
      title: file.title,
      type: 'file',
      audioType: file.audio_type
    }));
  } catch (error) {
    console.error("Error fetching available audio files:", error);
    throw error;
  }
}

// Add a file to a playlist
export async function addFileToPlaylist(playlistId: number, audioFileId: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/${playlistId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioFileId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error adding file ${audioFileId} to playlist ${playlistId}:`, error);
    throw error;
  }
}

// Remove a file from a playlist
export async function removeFileFromPlaylist(playlistId: number, audioFileId: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/${playlistId}/files/${audioFileId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error removing file ${audioFileId} from playlist ${playlistId}:`, error);
    throw error;
  }
}

export default {
  getAllPlaylists,
  getPlaylistById,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  getPlaylistFiles,
  getAvailableAudioFiles,
  addFileToPlaylist,
  removeFileFromPlaylist
};