import playlistModel from "./playlistModel.js";

// Interface for standardized service responses
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  notFound?: boolean;
}

export async function getAllPlaylists(): Promise<ServiceResponse<any[]>> {
  try {
    const playlists = await playlistModel.getAllPlaylists();
    return { success: true, data: playlists };
  } catch (error) {
    console.error('Service error getting all playlists:', error);
    return { success: false, error: 'Failed to retrieve playlists' };
  }
}

export async function getPlaylistById(id: number): Promise<ServiceResponse<any>> {
  try {
    const playlists = await playlistModel.getPlaylistById(id);
    if (playlists.length === 0) {
      return { success: false, notFound: true, error: 'Playlist not found' };
    }
    return { success: true, data: playlists[0] };
  } catch (error) {
    console.error(`Service error getting playlist ${id}:`, error);
    return { success: false, error: 'Failed to retrieve playlist' };
  }
}

export async function getPlaylistWithFiles(id: number): Promise<ServiceResponse<any>> {
  try {
    const playlistResponse = await getPlaylistById(id);
    if (!playlistResponse.success) {
      return playlistResponse;
    }
    
    const files = await playlistModel.getPlaylistFiles(id);
    return {
      success: true,
      data: {
        ...playlistResponse.data,
        files
      }
    };
  } catch (error) {
    console.error(`Service error getting playlist with files ${id}:`, error);
    return { success: false, error: 'Failed to retrieve playlist with files' };
  }
}

export async function createPlaylist(name: string, description: string | null): Promise<ServiceResponse<any>> {
  try {
    if (!name) {
      return { success: false, error: 'Playlist name is required' };
    }
    
    const insertId = await playlistModel.createPlaylist(name, description);
    if (!insertId) {
      return { success: false, error: 'Failed to create playlist' };
    }
    
    const playlistResponse = await getPlaylistById(insertId);
    if (!playlistResponse.success) {
      return { success: false, error: 'Playlist created but could not be retrieved' };
    }
    
    return { success: true, data: playlistResponse.data };
  } catch (error) {
    console.error('Service error creating playlist:', error);
    return { success: false, error: 'Failed to create playlist' };
  }
}

export async function updatePlaylist(
  id: number, 
  name: string, 
  description: string | null
): Promise<ServiceResponse<any>> {
  try {
    if (!name) {
      return { success: false, error: 'Playlist name is required' };
    }
    
    const playlistResponse = await getPlaylistById(id);
    if (!playlistResponse.success) {
      return playlistResponse;
    }
    
    const affectedRows = await playlistModel.updatePlaylist(id, name, description);
    if (!affectedRows) {
      return { success: false, error: 'Failed to update playlist' };
    }
    
    const updatedPlaylistResponse = await getPlaylistById(id);
    return { success: true, data: updatedPlaylistResponse.data };
  } catch (error) {
    console.error(`Service error updating playlist ${id}:`, error);
    return { success: false, error: 'Failed to update playlist' };
  }
}

export async function deletePlaylist(id: number): Promise<ServiceResponse<void>> {
  try {
    const playlistResponse = await getPlaylistById(id);
    if (!playlistResponse.success) {
      return playlistResponse;
    }
    
    const affectedRows = await playlistModel.deletePlaylist(id);
    if (!affectedRows) {
      return { success: false, error: 'Failed to delete playlist' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error deleting playlist ${id}:`, error);
    return { success: false, error: 'Failed to delete playlist' };
  }
}

export async function addFileToPlaylist(
  playlistId: number,
  audioFileId: number,
  position: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    const affectedRows = await playlistModel.addFileToPlaylist(playlistId, audioFileId, position);
    
    if (affectedRows === 0) {
      return { success: false, error: 'Failed to add file to playlist' };
    }
    return { success: true };
  } catch (error) {
    console.error(`Service error adding file ${audioFileId} to playlist ${playlistId}:`, error);
    return { success: false, error: 'Failed to add file to playlist' };
  }
}

// Add multiple files to a playlist
export async function addFilesToPlaylist(
  playlistId: number,
  audioFileIds: number[],
  startPosition: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    if (!audioFileIds || audioFileIds.length === 0) {
      return { success: false, error: 'No files specified' };
    }
    
    const affectedRows = await playlistModel.addFilesToPlaylist(playlistId, audioFileIds, startPosition);
    
    if (affectedRows === 0) {
      return { success: false, error: 'Failed to add files to playlist' };
    }
    return { success: true };
  } catch (error) {
    console.error(`Service error adding files to playlist ${playlistId}:`, error);
    return { success: false, error: 'Failed to add files to playlist' };
  }
}

export async function removeFileFromPlaylist(
  playlistId: number, 
  audioFileId: number
): Promise<ServiceResponse<void>> {
  try {
    const affectedRows = await playlistModel.removeFileFromPlaylist(playlistId, audioFileId);
    if (!affectedRows) {
      return { success: false, notFound: true, error: 'Playlist file not found' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error removing file ${audioFileId} from playlist ${playlistId}:`, error);
    return { success: false, error: 'Failed to remove file from playlist' };
  }
}

export async function updatePlaylistFilePosition(
  playlistId: number,
  audioFileId: number,
  targetPosition: number
): Promise<ServiceResponse<void>> {
  try {

    if (typeof targetPosition !== 'number') {
      return { success: false, error: 'Invalid play position' };
    }
    
    const affectedRows = await playlistModel.updatePlaylistFilePosition(playlistId, audioFileId, targetPosition);
    if (!affectedRows) {
      return { success: false, notFound: true, error: 'Playlist file not found' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating file position for ${audioFileId} in playlist ${playlistId}:`, error);
    return { success: false, error: 'Failed to update file position' };
  }
}

export async function updateFileRangePosition(
  playlistId: number,
  sourceStartPosition: number,
  sourceEndPosition: number,
  targetPosition: number
): Promise<ServiceResponse<void>> {
  try {
    if (
      typeof sourceStartPosition !== 'number' || 
      typeof sourceEndPosition !== 'number' || 
      typeof targetPosition !== 'number'
    ) {
      return { success: false, error: 'Invalid position parameters' };
    }
    
    if (sourceStartPosition > sourceEndPosition) {
      return { success: false, error: 'Start position must be less than or equal to end position' };
    }
    
    const affectedRows = await playlistModel.updateFileRangePosition(
      playlistId, 
      sourceStartPosition, 
      sourceEndPosition, 
      targetPosition
    );
    
    if (affectedRows === 0) {
      return { success: false, notFound: true, error: 'No playlist items found in the specified range' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error moving items in playlist ${playlistId}:`, error);
    return { success: false, error: 'Failed to move playlist items' };
  }
}

// Update the default export
export default {
  getAllPlaylists,
  getPlaylistById,
  getPlaylistWithFiles,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addFileToPlaylist,
  addFilesToPlaylist,
  removeFileFromPlaylist,
  updatePlaylistFilePosition,
  updateFileRangePosition
};
