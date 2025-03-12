import { executeQuery, QueryResult } from "../../../db.js";

export async function getAllPlaylists(): Promise<any[]> {
  const result = await executeQuery('SELECT * FROM music_playlists');
  return result as any[];
}

export async function getPlaylistById(playlistId: number): Promise<any[]> {
  const result = await executeQuery(
    'SELECT * FROM music_playlists WHERE playlist_id = ?',
    [playlistId]
  );
  return result as any[];
}

export async function getPlaylistFiles(playlistId: number): Promise<any[]> {
  const result = await executeQuery(
    `SELECT af.*, mpf.play_order 
     FROM audio_files af
     JOIN music_playlist_files mpf ON af.audio_file_id = mpf.audio_file_id
     WHERE mpf.playlist_id = ?
     ORDER BY mpf.play_order ASC`,
    [playlistId]
  );
  return result as any[];
}

export async function createPlaylist(name: string, description: string | null): Promise<number> {
  const result = await executeQuery<QueryResult>(
    'INSERT INTO music_playlists (name, description) VALUES (?, ?)',
    [name, description]
  );
  const queryResult = result as QueryResult;
  return queryResult.insertId || 0;
}

export async function updatePlaylist(
  playlistId: number, 
  name: string, 
  description: string | null
): Promise<number> {
  const result = await executeQuery<QueryResult>(
    'UPDATE music_playlists SET name = ?, description = ? WHERE playlist_id = ?',
    [name, description, playlistId]
  );
  const queryResult = result as QueryResult;
  return queryResult.affectedRows || 0;
}

export async function deletePlaylist(playlistId: number): Promise<number> {
  const result = await executeQuery<QueryResult>(
    'DELETE FROM music_playlists WHERE playlist_id = ?',
    [playlistId]
  );
  const queryResult = result as QueryResult;
  return queryResult.affectedRows || 0;
}

export async function addFileToPlaylist(
  playlistId: number,
  audioFileId: number,
  playOrder: number | null
): Promise<number> {
  // If playOrder is not provided, find the highest current order and add 1
  if (playOrder === null) {
    const currentOrders = await executeQuery<{maxOrder: number | null}>(
      'SELECT MAX(play_order) as maxOrder FROM music_playlist_files WHERE playlist_id = ?',
      [playlistId]
    );
    const orders = currentOrders as any[];
    playOrder = orders[0]?.maxOrder ? (orders[0].maxOrder + 1) : 1;
  }
  
  const result = await executeQuery<QueryResult>(
    'INSERT INTO music_playlist_files (playlist_id, audio_file_id, play_order) VALUES (?, ?, ?)',
    [playlistId, audioFileId, playOrder]
  );
  const queryResult = result as QueryResult;
  console.log('MODEL: queryResult', queryResult);
  return queryResult.affectedRows || 0;  // Return affectedRows instead of insertId
}

export async function removeFileFromPlaylist(
  playlistId: number, 
  audioFileId: number
): Promise<number> {
  const result = await executeQuery<QueryResult>(
    'DELETE FROM music_playlist_files WHERE playlist_id = ? AND audio_file_id = ?',
    [playlistId, audioFileId]
  );
  const queryResult = result as QueryResult;
  return queryResult.affectedRows || 0;
}

export async function updatePlaylistFileOrder(
  playlistId: number,
  audioFileId: number,
  newPlayOrder: number
): Promise<number> {
  const result = await executeQuery<QueryResult>(
    'UPDATE music_playlist_files SET play_order = ? WHERE playlist_id = ? AND audio_file_id = ?',
    [newPlayOrder, playlistId, audioFileId]
  );
  const queryResult = result as QueryResult;
  return queryResult.affectedRows || 0;
}

export default {
  getAllPlaylists,
  getPlaylistById,
  getPlaylistFiles,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addFileToPlaylist,
  removeFileFromPlaylist,
  updatePlaylistFileOrder
};
