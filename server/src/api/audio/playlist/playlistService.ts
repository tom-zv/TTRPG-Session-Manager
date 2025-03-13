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
  playOrder: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    const affectedRows = await playlistModel.addFileToPlaylist(playlistId, audioFileId, playOrder);
    
    if (affectedRows === 0) {
      return { success: false, error: 'Failed to add file to playlist' };
    }
    return { success: true };
  } catch (error) {
    console.error(`Service error adding file ${audioFileId} to playlist ${playlistId}:`, error);
    return { success: false, error: 'Failed to add file to playlist' };
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

export async function updatePlaylistFileOrder(
  playlistId: number,
  audioFileId: number,
  newPlayOrder: number
): Promise<ServiceResponse<void>> {
  try {
    if (typeof newPlayOrder !== 'number') {
      return { success: false, error: 'Invalid play order' };
    }
    
    const affectedRows = await playlistModel.updatePlaylistFileOrder(playlistId, audioFileId, newPlayOrder);
    if (!affectedRows) {
      return { success: false, notFound: true, error: 'Playlist file not found' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating file order for ${audioFileId} in playlist ${playlistId}:`, error);
    return { success: false, error: 'Failed to update file order' };
  }
}

export default {
  getAllPlaylists,
  getPlaylistById,
  getPlaylistWithFiles,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addFileToPlaylist,
  removeFileFromPlaylist,
  updatePlaylistFileOrder
};
