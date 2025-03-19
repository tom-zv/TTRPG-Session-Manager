import { AudioItem } from "../../types/AudioItem.js";

const API_URL = "/api/audio/playlists";

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

    return playlists.map((playlist) => ({
      id: playlist.playlist_id,
      title: playlist.name,
      description: playlist.description || undefined,
      type: "playlist" as const,
      itemCount: playlist.files?.length,
    }));
  } catch (error) {
    console.error("Error fetching playlists:", error);
    throw error;
  }
}

// Get a playlist by ID, optionally with its files
export async function getPlaylistById(
  id: number,
  includeFiles: boolean = true
): Promise<Playlist> {
  try {
    const response = await fetch(
      `${API_URL}/${id}?includeFiles=${includeFiles}`
    );
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
export async function createPlaylist(
  name: string,
  description?: string
): Promise<number> {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
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
export async function updatePlaylist(
  id: number,
  name: string,
  description?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
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
      method: "DELETE",
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
export async function getPlaylistFiles(
  playlistId: number
): Promise<AudioItem[]> {
  try {
    const playlist = await getPlaylistById(playlistId, true);

    if (!playlist.files) {
      return [];
    }

    // Convert to AudioItem format for AudioItemList component
    return playlist.files.map((file) => ({
      id: file.id,
      title: file.title,
      type: "file",
      duration: file.duration,
      position: file.position,
      audioType: file.audioType as "music" | "sfx" | "ambience",
    }));
  } catch (error) {
    console.error(`Error fetching files for playlist ${playlistId}:`, error);
    throw error;
  }
}

// Add a file to a playlist
export async function addFileToPlaylist(
  playlistId: number,
  audioFileId: number,
  position?: number
): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/${playlistId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioFileId,
        position: position !== undefined ? position : null,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error(
      `Error adding file ${audioFileId} to playlist ${playlistId}:`,
      error
    );
    throw error;
  }
}

// Add files to a playlist (batch operation)
export async function addFilesToPlaylist(
  playlistId: number,
  audioFileIds: number[],
  startPosition?: number
): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/${playlistId}/files/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioFileIds,
        startPosition: startPosition !== undefined ? startPosition : null,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error(`Error adding files to playlist ${playlistId}:`, error);
    throw error;
  }
}

// Unified function to add items to a playlist (handles both single and multiple items)
export async function addToPlaylist(
  playlistId: number,
  items: number[],
  position?: number
): Promise<boolean> {

  if (items.length === 0) return true;
  
  if (items.length === 1) {
    return await addFileToPlaylist(playlistId, items[0] as number, position);
  }
  else{
    return await addFilesToPlaylist(playlistId, items, position);
  }
 
}

// Remove files from a playlist - batch call for multiple files
export async function removeFilesFromPlaylist(
  playlistId: number,
  audioFileIds: number | number[]
): Promise<boolean> {
  if (!Array.isArray(audioFileIds)) {
    audioFileIds = [audioFileIds]; // Convert to array for consistency
  }
  for (const audioFileId of audioFileIds) {
    try {
      const response = await fetch(
        `${API_URL}/${playlistId}/files/${audioFileId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error(
        `Error removing file ${audioFileId} from playlist ${playlistId}:`,
        error
      );
      throw error;
    }
  }
  return true;
}

// Update position of a file in a playlist
export async function updateFilePosition(
  playlistId: number,
  audioFileId: number,
  targetPosition: number
): Promise<boolean> {
  try {

    console.log("updating file position: playlistID - %s, audioFileId - %s, targetPosition - %s", playlistId, audioFileId, targetPosition);

    const response = await fetch(
      `${API_URL}/${playlistId}/files/${audioFileId}/position`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPosition }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error(
      `Error updating position for file ${audioFileId} in playlist ${playlistId}:`,
      error
    );
    throw error;
  }
}

// Move a range of files to a new position in the playlist
export async function updateFileRangePosition(
  playlistId: number,
  sourceStartPosition: number,
  sourceEndPosition: number,
  targetPosition: number
): Promise<boolean> {
  try {
    console.log("updating file range position: playlistID - %s, source start position - %s, source end position - %s, targetPosition - %s", playlistId, sourceStartPosition, sourceEndPosition, targetPosition);
    const response = await fetch(`${API_URL}/${playlistId}/files/positions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceStartPosition,
        sourceEndPosition,
        targetPosition,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error(`Error moving files in playlist ${playlistId}:`, error);
    throw error;
  }
}

// Unified function to update positions (handles both single and range updates)
export async function updatePosition(
  playlistId: number,
  audioFileId: number,
  targetPosition: number,
  sourceStartPosition?: number,
  sourceEndPosition?: number
): Promise<boolean> {
  // Determine if this is a range update or single file update
  
  if (sourceStartPosition !== undefined && sourceEndPosition !== undefined) {
    return await updateFileRangePosition(
      playlistId,
      sourceStartPosition,
      sourceEndPosition,
      targetPosition
    );
  } else {
    return await updateFilePosition(playlistId, audioFileId, targetPosition);
  }
}

// Update the default export to include the new functions
export default {
  getAllPlaylists,
  getPlaylistById,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  getPlaylistFiles,
  //
  addFileToPlaylist,
  addFilesToPlaylist,
  addToPlaylist,
  //
  removeFilesFromPlaylist,
  //removeFilesFromPlaylist,
  //removeFromPlaylist,
  //
  updateFilePosition,
  updateFileRangePosition,
  updatePosition,
};
