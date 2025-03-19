import { pool } from "src/db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";


export async function getAllPlaylists(): Promise<RowDataPacket[]> {
  const [result] = await pool.execute('SELECT * FROM playlists');
  return result as RowDataPacket[];
}

export async function getPlaylistById(playlistId: number): Promise<RowDataPacket[]> {
  const [result] = await pool.execute(
    'SELECT * FROM playlists WHERE playlist_id = ?',
    [playlistId]
  );
  return result as RowDataPacket[];
}

export async function getPlaylistFiles(playlistId: number): Promise<RowDataPacket[]> {
  const [result] = await pool.execute(
    `SELECT af.*, mpf.position 
     FROM audio_files af
     JOIN playlist_files mpf ON af.audio_file_id = mpf.audio_file_id
     WHERE mpf.playlist_id = ?
     ORDER BY mpf.position ASC`,
    [playlistId]
  );
  return result as RowDataPacket[];
}

export async function createPlaylist(name: string, description: string | null): Promise<number> {
  const [result] = await pool.execute(
    'INSERT INTO playlists (name, description) VALUES (?, ?)',
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
    'UPDATE playlists SET name = ?, description = ? WHERE playlist_id = ?',
    [name, description, playlistId]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function deletePlaylist(playlistId: number): Promise<number> {
  const [result] = await pool.execute(
    'DELETE FROM playlists WHERE playlist_id = ?',
    [playlistId]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

/* Playlist file management 
/*****************************/
export async function addFileToPlaylist(
  playlistId: number,
  audioFileId: number,
  position: number | null
): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // If position is not provided, find the highest current Position and add 1
    if (position === null) {
      const [currentPositions] = await connection.execute<RowDataPacket[]>(
        'SELECT MAX(position) as maxPosition FROM playlist_files WHERE playlist_id = ?',
        [playlistId]
      );
      
      position = currentPositions[0]?.maxPosition ? (currentPositions[0].maxPosition + 1) : 0;
    } else {
      // If inserting at a specific position, move all existing items up
      await connection.execute(
        'UPDATE playlist_files SET position = position + 1 WHERE playlist_id = ? AND position >= ? ORDER BY position DESC',
        [playlistId, position]
      );
    }
    
    let result;
    // Insert new entry
    [result] = await connection.execute(
      "INSERT INTO playlist_files (playlist_id, audio_file_id, position) VALUES (?, ?, ?)",
      [playlistId, audioFileId, position]
    );
    
    await connection.commit();
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error: any) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      //console.log('File already exists in playlist, not an error');
      // Return a special code to indicate duplicate entry
      return -1;
    }
    // Rethrow the error for other cases
    throw error;
  } finally {
    connection.release();
  }
}

export async function addFilesToPlaylist(
  playlistId: number,
  audioFileIds: number[],
  startPosition: number | null = null
): Promise<number> {

  if (!audioFileIds.length) return 0;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let insertPosition = startPosition;
    
    // If position is not provided, find the highest current position and add 1
    if (insertPosition === null) {
      const [currentPositions] = await connection.execute<RowDataPacket[]>(
        'SELECT MAX(position) as maxPosition FROM playlist_files WHERE playlist_id = ?',
        [playlistId]
      );
      insertPosition = currentPositions[0]?.maxPosition ? (currentPositions[0].maxPosition + 1) : 1;
    } else {
      // If inserting at a specific position, move all existing items up by the number of files we're adding
      await connection.execute(
        'UPDATE playlist_files SET position = position + ? WHERE playlist_id = ? AND position >= ? ORDER BY position DESC',
        [audioFileIds.length, playlistId, insertPosition]
      );
    }
    
    // Prepare batch insert values
    const values = audioFileIds.map((audioFileId, index) => [
      playlistId, 
      audioFileId, 
      insertPosition! + index
    ]);
    
    // Use multi-row insert for better performance
    const placeholders = values.map(() => '(?, ?, ?)').join(', ');
    const flatValues = values.flat();
    
    const [result] = await connection.execute(
      `INSERT INTO playlist_files (playlist_id, audio_file_id, position) VALUES ${placeholders} 
       ON DUPLICATE KEY UPDATE position = VALUES(position)`,
      flatValues
    );
    
    await connection.commit();
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function removeFileFromPlaylist(
  playlistId: number, 
  audioFileId: number
): Promise<number> {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get the current position of the file to be removed
    const [fileRows] = await connection.execute<RowDataPacket[]>(
      'SELECT position FROM playlist_files WHERE playlist_id = ? AND audio_file_id = ?',
      [playlistId, audioFileId]
    );
    
    if (fileRows.length === 0) {
      await connection.commit();
      return 0; // File not found
    }
    
    const currentPosition = fileRows[0].position;
    
    // Delete the file
    const [deleteResult] = await connection.execute(
      'DELETE FROM playlist_files WHERE playlist_id = ? AND audio_file_id = ?',
      [playlistId, audioFileId]
    );
    
    // Update position for all files that have a higher position
    await connection.execute(
      'UPDATE playlist_files SET position = position - 1 WHERE playlist_id = ? AND position > ? ORDER BY position ASC',
      [playlistId, currentPosition]
    );
    
    await connection.commit();
    return (deleteResult as ResultSetHeader).affectedRows || 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updatePlaylistFilePosition(
  playlistId: number,
  audioFileId: number,
  targetPosition: number
): Promise<number> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the current position of the file
    const [fileRows] = await connection.execute<RowDataPacket[]>(
      'SELECT position FROM playlist_files WHERE playlist_id = ? AND audio_file_id = ?',
      [playlistId, audioFileId]
    );

    if (fileRows.length === 0) {
      await connection.commit();
      return 0; // File not found
    }

    const currentPosition = fileRows[0].position;

    if (currentPosition === targetPosition) {
      await connection.commit();
      return 1; // No change needed
    }

    // Remove the file from its current position by negating its position
    if (currentPosition === 0) {
      await connection.execute(
        'UPDATE playlist_files SET position = -1 WHERE playlist_id = ? AND audio_file_id = ?',
        [playlistId, audioFileId]
      );
    } else {
      await connection.execute(
        'UPDATE playlist_files SET position = -position WHERE playlist_id = ? AND audio_file_id = ?',
        [playlistId, audioFileId]
      );
    }

    // Calculate the effective target position:
    // If moving downward, subtract 1 to account for the gap left by removal.
    let effectiveTarget = targetPosition;

    if (targetPosition > currentPosition) {
      // Shift files between currentPosition and effectivePosition upward (decrement)
      effectiveTarget = targetPosition - 1;
      await connection.execute(
        'UPDATE playlist_files SET position = position - 1 WHERE playlist_id = ? AND ? < position AND position < ? ORDER BY position ASC',
        [playlistId, currentPosition, targetPosition]
      );
    } else {
      // For upward moves, shift files between targetPosition and currentPosition downward (increment)
      await connection.execute(                            
        'UPDATE playlist_files SET position = position + 1 WHERE playlist_id = ? AND ? <= position AND position < ? ORDER BY position DESC',
        [playlistId, targetPosition, currentPosition]
      );
    }

    // Place the file in its new effective position
    const [result] = await connection.execute(
      'UPDATE playlist_files SET position = ? WHERE playlist_id = ? AND audio_file_id = ?',
      [effectiveTarget, playlistId, audioFileId]
    );

    await connection.commit();
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


export async function updateFileRangePosition(
  playlistId: number,
  sourceStartPosition: number,
  sourceEndPosition: number,
  targetPosition: number
): Promise<number> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (sourceStartPosition > sourceEndPosition) {
      throw new Error(
        "Start position must be less than or equal to end position"
      );
    }

    const itemCount = sourceEndPosition - sourceStartPosition + 1;

    // If targetPosition equals the current starting position (or exactly after the range),
    // no change is needed.
    if (
      targetPosition === sourceStartPosition ||
      targetPosition === sourceStartPosition + itemCount
    ) {
      await connection.commit();
      return itemCount;
    }

    // Get all files in the moving range
    const [filesToMove] = await connection.execute<RowDataPacket[]>(
      "SELECT audio_file_id, position FROM playlist_files WHERE playlist_id = ? AND position >= ? AND position <= ? ORDER BY position",
      [playlistId, sourceStartPosition, sourceEndPosition]
    );

    if (filesToMove.length === 0) {
      await connection.commit();
      return 0;
    }

    // Remove the moving items from their positions
    await connection.execute(
      `UPDATE playlist_files
       SET position = CASE WHEN position = 0 THEN -(? + 1) ELSE -position END
       WHERE playlist_id = ? AND position >= ? AND position <= ?`,
      [sourceEndPosition, playlistId, sourceStartPosition, sourceEndPosition]
    );

    let effectiveTarget = targetPosition;
    

    if (targetPosition > sourceEndPosition) {
      // Downward move: adjust effective target to account for the gap created by the removal
      effectiveTarget = targetPosition - itemCount;

      // Shift files between sourceEndPosition and target (decrement)
      await connection.execute(
        "UPDATE playlist_files SET position = position - ? WHERE playlist_id = ? AND ? < position AND position < ? AND position >= 0 ORDER BY position ASC",
        [itemCount, playlistId, sourceEndPosition, targetPosition]
      );
    } else {
      // Upward move: shift files between Target and sourceStartPosition downward (increment)

      await connection.execute(
        "UPDATE playlist_files SET position = position + ? WHERE playlist_id = ? AND ? <= position AND position < ? AND position >= 0 ORDER BY position DESC",
        [itemCount, playlistId, targetPosition, sourceStartPosition]
      );
    }

    
    // Place the moved items at their new positions
    let affected = 0;
    for (let i = 0; i < filesToMove.length; i++) {
      const [result] = await connection.execute(
        "UPDATE playlist_files SET position = ? WHERE playlist_id = ? AND audio_file_id = ?",
        [effectiveTarget + i, playlistId, filesToMove[i].audio_file_id]
      );
      affected += (result as ResultSetHeader).affectedRows;
    }

    await connection.commit();
    return affected;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Debug: Show final playlist state
// const debugShowPlaylistFiles = async (playlistId: number) => {

//   const connection = await pool.getConnection();

//   const [state] = await connection.execute<RowDataPacket[]>(
//     'SELECT audio_file_id, position FROM playlist_files WHERE playlist_id = ? ORDER BY position',
//     [playlistId]
//   );
//   console.log('playlist state:', state.map(file => ({
//     audio_file_id: file.audio_file_id - 1,
//       position: file.position 
//   })));
// }

export default {
  getAllPlaylists,
  getPlaylistById,
  getPlaylistFiles,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addFileToPlaylist,
  addFilesToPlaylist,
  removeFileFromPlaylist,
  updatePlaylistFilePosition,
  updateFileRangePosition
};
