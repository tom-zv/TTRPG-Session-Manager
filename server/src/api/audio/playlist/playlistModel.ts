import { pool } from "../../../db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";


export async function getAllPlaylists(): Promise<RowDataPacket[]> {
  const [result] = await pool.execute('SELECT * FROM music_playlists');
  return result as RowDataPacket[];
}

export async function getPlaylistById(playlistId: number): Promise<RowDataPacket[]> {
  const [result] = await pool.execute(
    'SELECT * FROM music_playlists WHERE playlist_id = ?',
    [playlistId]
  );
  return result as RowDataPacket[];
}

export async function getPlaylistFiles(playlistId: number): Promise<RowDataPacket[]> {
  const [result] = await pool.execute(
    `SELECT af.*, mpf.play_order 
     FROM audio_files af
     JOIN music_playlist_files mpf ON af.audio_file_id = mpf.audio_file_id
     WHERE mpf.playlist_id = ?
     ORDER BY mpf.play_order ASC`,
    [playlistId]
  );
  return result as RowDataPacket[];
}

export async function createPlaylist(name: string, description: string | null): Promise<number> {
  const [result] = await pool.execute(
    'INSERT INTO music_playlists (name, description) VALUES (?, ?)',
    [name, description]
  );
  return (result as ResultSetHeader).insertId || 0;
}

export async function updatePlaylist(
  playlistId: number, 
  name: string, 
  description: string | null
): Promise<number> {
  const [result] = await pool.execute(
    'UPDATE music_playlists SET name = ?, description = ? WHERE playlist_id = ?',
    [name, description, playlistId]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function deletePlaylist(playlistId: number): Promise<number> {
  const [result] = await pool.execute(
    'DELETE FROM music_playlists WHERE playlist_id = ?',
    [playlistId]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function addFileToPlaylist(
  playlistId: number,
  audioFileId: number,
  playOrder: number | null
): Promise<number> {
  try {
    // If playOrder is not provided, find the highest current order and add 1
    if (playOrder === null) {
      const [currentOrders] = await pool.execute<RowDataPacket[]>(
        'SELECT MAX(play_order) as maxOrder FROM music_playlist_files WHERE playlist_id = ?',
        [playlistId]
      );
      playOrder = currentOrders[0]?.maxOrder ? (currentOrders[0].maxOrder + 1) : 1;
    }
    
    const [result] = await pool.execute(
      'INSERT INTO music_playlist_files (playlist_id, audio_file_id, play_order) VALUES (?, ?, ?)',
      [playlistId, audioFileId, playOrder]
    );
    
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('File already exists in playlist, not an error');
      // Return a special code to indicate duplicate entry
      return -1;
    }
    // Rethrow the error for other cases
    throw error;
  }
}

export async function removeFileFromPlaylist(
  playlistId: number, 
  audioFileId: number
): Promise<number> {
  const [result] = await pool.execute(
    'DELETE FROM music_playlist_files WHERE playlist_id = ? AND audio_file_id = ?',
    [playlistId, audioFileId]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function updatePlaylistFileOrder(
  playlistId: number,
  audioFileId: number,
  newPlayOrder: number
): Promise<number> {
  const [result] = await pool.execute(
    'UPDATE music_playlist_files SET play_order = ? WHERE playlist_id = ? AND audio_file_id = ?',
    [newPlayOrder, playlistId, audioFileId]
  );
  return (result as ResultSetHeader).affectedRows || 0;
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
