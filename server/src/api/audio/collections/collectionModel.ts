import { audioPool } from "src/db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import type {
  CollectionDB,
  CollectionAudioFileDB,
  MacroDB,
} from "../types.js";

const COLLECTIONS_TABLE = 'collections';
const COLLECTION_FILES_TABLE = 'collection_files';
const COLLECTION_SFX_MACROS_TABLE = 'collection_sfx_macros';

export async function getAllCollections(type: string): Promise<CollectionDB[]> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  let query;
  // Use a different query for SFX collections to count both files and macros
  if (type === 'sfx') {
    query = `
      SELECT c.*, 
        (
          SELECT COUNT(cf.file_id) 
          FROM ${COLLECTION_FILES_TABLE} cf 
          WHERE cf.collection_id = c.id
        ) + (
          SELECT COUNT(cm.macro_id) 
          FROM ${COLLECTION_SFX_MACROS_TABLE} cm 
          WHERE cm.collection_id = c.id
        ) AS item_count
      FROM ${COLLECTIONS_TABLE} c
      WHERE c.type = ?
      GROUP BY c.id
      ORDER BY c.name ASC
    `;
  } else {
    query = `
      SELECT c.*, COUNT(cf.file_id) AS item_count
      FROM ${COLLECTIONS_TABLE} c
      LEFT JOIN ${COLLECTION_FILES_TABLE} cf ON c.id = cf.collection_id
      WHERE c.type = ?
      GROUP BY c.id
      ORDER BY c.name ASC
    `;
  }

  const [result] = await audioPool.execute(query, [type]);
  return result as CollectionDB[];
}

export async function getAllCollectionsAllTypes(): Promise<CollectionDB[]> {
  const [result] = await audioPool.execute(
    `SELECT c.*, COUNT(cf.file_id) AS item_count
       FROM ${COLLECTIONS_TABLE} c
       LEFT JOIN ${COLLECTION_FILES_TABLE} cf ON c.id = cf.collection_id
       GROUP BY c.id
       ORDER BY c.type, c.name ASC`
  );
  return result as CollectionDB[];
}

export async function getCollectionById(type: string, collectionId: number): Promise<CollectionDB[]> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const [result] = await audioPool.execute(
    `SELECT * FROM ${COLLECTIONS_TABLE} WHERE id = ? AND type = ?`,
    [collectionId, type]
  );
  return result as CollectionDB[];
}

export async function createCollection(type: string, name: string, description: string | null): Promise<number> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const [result] = await audioPool.execute(
    `INSERT INTO ${COLLECTIONS_TABLE} (name, description, type) VALUES (?, ?, ?)`,
    [name, description, type]
  );
  return (result as ResultSetHeader).insertId || 0;
}

export async function updateCollection(
  type: string,
  collectionId: number,
  name?: string,
  description?: string | null
): Promise<number> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }

  const fields = [];
  const params = [];

  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }
  if (description !== undefined) {
    fields.push('description = ?');
    params.push(description);
  }
  
  if (fields.length === 0) {
    return 0;
  }
  params.push(collectionId, type);

  const sql = `
    UPDATE ${COLLECTIONS_TABLE}
    SET ${fields.join(', ')}
    WHERE id = ? AND type = ?
  `;

  const [result] = await audioPool.execute(sql, params);
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function deleteCollection(type: string, collectionId: number): Promise<number> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const [result] = await audioPool.execute(
    `DELETE FROM ${COLLECTIONS_TABLE} WHERE id = ? AND type = ?`,
    [collectionId, type]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

/* Collection file management endpoints 
 ****************************************/

export async function getCollectionFiles(
  type: string,
  collectionId: number
): Promise<{ files: CollectionAudioFileDB[], macros: MacroDB[] }> {
  if (!["playlist", "sfx", "ambience"].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }

  const [files] = await audioPool.execute(
    `SELECT af.*, cf.position, cf.volume, cf.active
       FROM files af
       JOIN ${COLLECTION_FILES_TABLE} cf ON af.id = cf.file_id
       WHERE cf.collection_id = ?
       ORDER BY cf.position ASC`,
    [collectionId]
  );

  // For SFX collections, get both files and macros
  let macros: MacroDB[] = [];

  if (type == "sfx") {
    const [macroResults] = await audioPool.execute(
      `SELECT m.*, cm.position,
              COUNT(mf.file_id) AS item_count,
              GROUP_CONCAT(
                CASE 
                  WHEN af.id IS NOT NULL THEN JSON_OBJECT(
                    'id', af.id,
                    'name', af.name,
                    'audio_type', af.audio_type,
                    'rel_path', af.rel_path,
                    'folder_id', af.folder_id,
                    'url', af.url,
                    'duration', af.duration,
                    'delay', mf.delay,
                    'volume', mf.volume
                  )
                  ELSE NULL
                END
              ) AS files
            FROM sfx_macros m
            JOIN ${COLLECTION_SFX_MACROS_TABLE} cm ON m.id = cm.macro_id
            LEFT JOIN sfx_macro_files mf ON m.id = mf.macro_id 
            LEFT JOIN files af ON mf.file_id = af.id 
            WHERE cm.collection_id = ?
            GROUP BY m.id, cm.position
            ORDER BY cm.position ASC`,
      [collectionId]
    );
    macros = macroResults as MacroDB[];
  }

  return { files: files as CollectionAudioFileDB[], macros };
}

export async function addFileToCollection(
  type: string,
  collectionId: number,
  fileId: number,
  position: number | null
): Promise<number> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const connection = await audioPool.getConnection();
  try {
    await connection.beginTransaction();
    
    // If position is not provided, find the highest current Position and add 1
    if (position === null) {
      if (type === 'sfx') {
        // For SFX collections, we need to check both collection file & macro tables for the max position
        const [filePositions] = await connection.execute<RowDataPacket[]>(
          `SELECT MAX(position) as maxPosition FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ?`,
          [collectionId]
        );
        
        const [macroPositions] = await connection.execute<RowDataPacket[]>(
          `SELECT MAX(position) as maxPosition FROM ${COLLECTION_SFX_MACROS_TABLE} WHERE collection_id = ?`,
          [collectionId]
        );
        
        const fileMaxPos = filePositions[0]?.maxPosition || 0;
        const macroMaxPos = macroPositions[0]?.maxPosition || 0;
        position = Math.max(fileMaxPos, macroMaxPos) + 1;
      } else {
        const [currentPositions] = await connection.execute<RowDataPacket[]>(
          `SELECT MAX(position) as maxPosition FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ?`,
          [collectionId]
        );
        
        position = currentPositions[0]?.maxPosition ? (currentPositions[0].maxPosition + 1) : 0;
      }
    } else {
      // If inserting at a specific position, move all existing items up
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position + 1 WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
        [collectionId, position]
      );
      
      // For SFX collections, also update positions in the macros table
      if (type === 'sfx') {
        await connection.execute(
          `UPDATE ${COLLECTION_SFX_MACROS_TABLE} SET position = position + 1 WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
          [collectionId, position]
        );
      }
    }
    
    
    // Insert new entry
    const [result] = await connection.execute(
      `INSERT INTO ${COLLECTION_FILES_TABLE} (collection_id, file_id, position) VALUES (?, ?, ?)`,
      [collectionId, fileId, position]
    );
    
    await connection.commit();
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error: unknown) {
    await connection.rollback();
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      return -1; // Special code to indicate duplicate entry
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function addFilesToCollection(
  type: string,
  collectionId: number,
  fileIds: number[],
  startPosition: number | null = null
): Promise<number> {
  if (!fileIds.length) return 0;
  
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const connection = await audioPool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let insertPosition = startPosition;
    
    // If position is not provided, find the highest current position and add 1
    if (insertPosition === null) {
      if (type === 'sfx') {
        // For SFX collections, check max positions across both tables
        const [filePositions] = await connection.execute<RowDataPacket[]>(
          `SELECT MAX(position) as maxPosition FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ?`,
          [collectionId]
        );
        
        const [macroPositions] = await connection.execute<RowDataPacket[]>(
          `SELECT MAX(position) as maxPosition FROM ${COLLECTION_SFX_MACROS_TABLE} WHERE collection_id = ?`,
          [collectionId]
        );
        
        const fileMaxPos = filePositions[0]?.maxPosition || 0;
        const macroMaxPos = macroPositions[0]?.maxPosition || 0;
        insertPosition = Math.max(fileMaxPos, macroMaxPos) + 1;
      } else {
        const [currentPositions] = await connection.execute<RowDataPacket[]>(
          `SELECT MAX(position) as maxPosition FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ?`,
          [collectionId]
        );
        insertPosition = currentPositions[0]?.maxPosition ? (currentPositions[0].maxPosition + 1) : 0;
      }
    } else {
      // If inserting at a specific position, move all existing items up by the number of files we're adding
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position + ? WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
        [fileIds.length, collectionId, insertPosition]
      );
      
      // For SFX collections, also update positions in the macros table
      if (type === 'sfx') {
        await connection.execute(
          `UPDATE ${COLLECTION_SFX_MACROS_TABLE} SET position = position + ? WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
          [fileIds.length, collectionId, insertPosition]
        );
      }
    }
    
    // Prepare batch insert values
    const values = fileIds.map((fileId, index) => [
      collectionId, 
      fileId, 
      insertPosition! + index
    ]);
    
    // Use multi-row insert for better performance
    const placeholders = values.map(() => '(?, ?, ?)').join(', ');
    const flatValues = values.flat();
    
    const [result] = await connection.execute(
      `INSERT INTO ${COLLECTION_FILES_TABLE} (collection_id, file_id, position) VALUES ${placeholders} 
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

// Update collection file properties
export async function updateCollectionFile(
  collectionId: number,
  fileId: number,
  params: { 
    active?: boolean;
    volume?: number;
    position?: number;
  }
): Promise<number> {
  // Build dynamic query based on provided params
  const updateFields: string[] = [];
  const fields = [];
  
  if (params.active !== undefined) {
    updateFields.push('active = ?');
    fields.push(params.active);
  }

  if (params.volume !== undefined) {
    updateFields.push('volume = ?');
    fields.push(params.volume);
  }
  
  if (params.position !== undefined) {
    updateFields.push('position = ?');
    fields.push(params.position);
  }
  
  // If no fields to update, return early
  if (updateFields.length === 0) {
    return 0;
  }
  
  // Add parameters for WHERE clause
  fields.push(collectionId, fileId);
  
  const [result] = await audioPool.execute(
    `UPDATE ${COLLECTION_FILES_TABLE} SET ${updateFields.join(', ')} 
     WHERE collection_id = ? AND file_id = ?`,
    fields
  );
  
  return ((result as unknown) as ResultSetHeader).affectedRows || 0;
}

export async function removeFileFromCollection(
  type: string,
  collectionId: number, 
  fileId: number
): Promise<number> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const connection = await audioPool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get the current position of the file to be removed
    const [fileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT position FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ? AND file_id = ?`,
      [collectionId, fileId]
    );
    
    if (fileRows.length === 0) {
      await connection.commit();
      return 0; // File not found
    }
    
    const currentPosition = fileRows[0].position;
    
    // Delete the file
    const [deleteResult] = await connection.execute(
      `DELETE FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ? AND file_id = ?`,
      [collectionId, fileId]
    );
    
    // Update position for all files that have a higher position
    await connection.execute(
      `UPDATE ${COLLECTION_FILES_TABLE} SET position = position - 1 WHERE collection_id = ? AND position > ? ORDER BY position ASC`,
      [collectionId, currentPosition]
    );
    
    // For SFX collections, also update positions in the macros table
    if (type === 'sfx') {
      await connection.execute(
        `UPDATE ${COLLECTION_SFX_MACROS_TABLE} SET position = position - 1 WHERE collection_id = ? AND position > ? ORDER BY position ASC`,
        [collectionId, currentPosition]
      );
    }
    
    await connection.commit();
    return (deleteResult as ResultSetHeader).affectedRows || 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateCollectionFilePosition(
  type: string,
  collectionId: number,
  fileId: number,
  targetPosition: number
): Promise<number> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const connection = await audioPool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the current position of the file
    const [fileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT position FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ? AND file_id = ?`,
      [collectionId, fileId]
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
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = -1 WHERE collection_id = ? AND file_id = ?`,
        [collectionId, fileId]
      );
    } else {
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = -position WHERE collection_id = ? AND file_id = ?`,
        [collectionId, fileId]
      );
    }

    // Calculate the effective target position
    let effectiveTarget = targetPosition;

    if (targetPosition > currentPosition) {
      // Shift files between currentPosition and effectivePosition upward (decrement)
      effectiveTarget = targetPosition - 1;
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position - 1 WHERE collection_id = ? AND ? < position AND position < ? ORDER BY position ASC`,
        [collectionId, currentPosition, targetPosition]
      );
    } else {
      // For upward moves, shift files between targetPosition and currentPosition downward (increment)
      await connection.execute(                            
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position + 1 WHERE collection_id = ? AND ? <= position AND position < ? ORDER BY position DESC`,
        [collectionId, targetPosition, currentPosition]
      );
    }

    // Place the file in its new effective position
    const [result] = await connection.execute(
      `UPDATE ${COLLECTION_FILES_TABLE} SET position = ? WHERE collection_id = ? AND file_id = ?`,
      [effectiveTarget, collectionId, fileId]
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
  type: string,
  collectionId: number,
  sourceStartPosition: number,
  sourceEndPosition: number,
  targetPosition: number
): Promise<number> {
  if (!['playlist', 'sfx', 'ambience'].includes(type)) {
    throw new Error(`Invalid collection type: ${type}`);
  }
  
  const connection = await audioPool.getConnection();

  try {
    await connection.beginTransaction();

    if (sourceStartPosition > sourceEndPosition) {
      throw new Error("Start position must be less than or equal to end position");
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
      `SELECT file_id, position FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ? AND position >= ? AND position <= ? ORDER BY position`,
      [collectionId, sourceStartPosition, sourceEndPosition]
    );

    if (filesToMove.length === 0) {
      await connection.commit();
      return 0;
    }

    // Remove the moving items from their positions
    await connection.execute(
      `UPDATE ${COLLECTION_FILES_TABLE}
       SET position = CASE WHEN position = 0 THEN -(? + 1) ELSE -position END
       WHERE collection_id = ? AND position >= ? AND position <= ?`,
      [sourceEndPosition, collectionId, sourceStartPosition, sourceEndPosition]
    );

    let effectiveTarget = targetPosition;

    if (targetPosition > sourceEndPosition) {
      // Downward move: adjust effective target to account for the gap created by the removal
      effectiveTarget = targetPosition - itemCount;

      // Shift files between sourceEndPosition and target (decrement)
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position - ? WHERE collection_id = ? AND ? < position AND position < ? AND position >= 0 ORDER BY position ASC`,
        [itemCount, collectionId, sourceEndPosition, targetPosition]
      );
    } else {
      // Upward move: shift files between Target and sourceStartPosition downward (increment)
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position + ? WHERE collection_id = ? AND ? <= position AND position < ? AND position >= 0 ORDER BY position DESC`,
        [itemCount, collectionId, targetPosition, sourceStartPosition]
      );
    }

    // Place the moved items at their new positions
    let affected = 0;
    for (let i = 0; i < filesToMove.length; i++) {
      const [result] = await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = ? WHERE collection_id = ? AND file_id = ?`,
        [effectiveTarget + i, collectionId, filesToMove[i].file_id]
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

/* Macro collection management endpoints 
 ****************************************/

export async function addMacroToCollection(
  collectionId: number,
  macroId: number,
  position: number | null = null
): Promise<number> {
  const connection = await audioPool.getConnection();
  try {
    await connection.beginTransaction();
    
    // If position is not provided, find the highest current Position and add 1
    if (position === null) {
      // For macros, we need to check both tables for the max position
      const [filePositions] = await connection.execute<RowDataPacket[]>(
        `SELECT MAX(position) as maxPosition FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ?`,
        [collectionId]
      );
      
      const [macroPositions] = await connection.execute<RowDataPacket[]>(
        `SELECT MAX(position) as maxPosition FROM ${COLLECTION_SFX_MACROS_TABLE} WHERE collection_id = ?`,
        [collectionId]
      );
      
      const fileMaxPos = filePositions[0]?.maxPosition || 0;
      const macroMaxPos = macroPositions[0]?.maxPosition || 0;
      position = Math.max(fileMaxPos, macroMaxPos) + 1;
    } else {
      // If inserting at a specific position, move all existing items up in both tables
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position + 1 WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
        [collectionId, position]
      );
      
      await connection.execute(
        `UPDATE ${COLLECTION_SFX_MACROS_TABLE} SET position = position + 1 WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
        [collectionId, position]
      );
    }
    
    // Insert new entry
    const [result] = await connection.execute(
      `INSERT INTO ${COLLECTION_SFX_MACROS_TABLE} (collection_id, macro_id, position) VALUES (?, ?, ?)`,
      [collectionId, macroId, position]
    );
    
    await connection.commit();
    
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error: unknown) {
    await connection.rollback();
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      return -1; // Special code to indicate duplicate entry
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function addMacrosToCollection(
  collectionId: number,
  macroIds: number[],
  startPosition: number | null = null
): Promise<number> {
  if (!macroIds.length) return 0;
  
  const connection = await audioPool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let insertPosition = startPosition;
    
    // If position is not provided, find the highest current position and add 1
    if (insertPosition === null) {
      // For macros, check max positions across both tables
      const [filePositions] = await connection.execute<RowDataPacket[]>(
        `SELECT MAX(position) as maxPosition FROM ${COLLECTION_FILES_TABLE} WHERE collection_id = ?`,
        [collectionId]
      );
      
      const [macroPositions] = await connection.execute<RowDataPacket[]>(
        `SELECT MAX(position) as maxPosition FROM ${COLLECTION_SFX_MACROS_TABLE} WHERE collection_id = ?`,
        [collectionId]
      );
      
      const fileMaxPos = filePositions[0]?.maxPosition || 0;
      const macroMaxPos = macroPositions[0]?.maxPosition || 0;
      insertPosition = Math.max(fileMaxPos, macroMaxPos) + 1;
    } else {
      // If inserting at a specific position, move all existing items up in both tables
      await connection.execute(
        `UPDATE ${COLLECTION_FILES_TABLE} SET position = position + ? WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
        [macroIds.length, collectionId, insertPosition]
      );
      
      await connection.execute(
        `UPDATE ${COLLECTION_SFX_MACROS_TABLE} SET position = position + ? WHERE collection_id = ? AND position >= ? ORDER BY position DESC`,
        [macroIds.length, collectionId, insertPosition]
      );
    }
    
    // Prepare batch insert values
    const values = macroIds.map((macroId, index) => [
      collectionId, 
      macroId, 
      insertPosition! + index
    ]);
    
    // Use multi-row insert for better performance
    const placeholders = values.map(() => '(?, ?, ?)').join(', ');
    const flatValues = values.flat();
    
    const [result] = await connection.execute(
      `INSERT INTO ${COLLECTION_SFX_MACROS_TABLE} (collection_id, macro_id, position) VALUES ${placeholders} 
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

export async function removeMacroFromCollection(
  collectionId: number, 
  macroId: number
): Promise<number> {
  const connection = await audioPool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get the current position of the macro to be removed
    const [macroRows] = await connection.execute<RowDataPacket[]>(
      `SELECT position FROM ${COLLECTION_SFX_MACROS_TABLE} WHERE collection_id = ? AND macro_id = ?`,
      [collectionId, macroId]
    );
    
    if (macroRows.length === 0) {
      await connection.commit();
      return 0; // Macro not found
    }
    
    const currentPosition = macroRows[0].position;
    
    // Delete the macro
    const [deleteResult] = await connection.execute(
      `DELETE FROM ${COLLECTION_SFX_MACROS_TABLE} WHERE collection_id = ? AND macro_id = ?`,
      [collectionId, macroId]
    );
    
    // Update position for all files and macros that have a higher position
    // First update macro positions
    await connection.execute(
      `UPDATE ${COLLECTION_SFX_MACROS_TABLE} SET position = position - 1 WHERE collection_id = ? AND position > ? ORDER BY position ASC`,
      [collectionId, currentPosition]
    );
    
    // Also update file positions
    await connection.execute(
      `UPDATE ${COLLECTION_FILES_TABLE} SET position = position - 1 WHERE collection_id = ? AND position > ? ORDER BY position ASC`,
      [collectionId, currentPosition]
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

export default {
  getAllCollections,
  getAllCollectionsAllTypes,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionFiles,
  addFileToCollection,
  addFilesToCollection,
  updateCollectionFile,  
  removeFileFromCollection,
  updateCollectionFilePosition,
  updateFileRangePosition,
  addMacroToCollection,
  addMacrosToCollection,
  removeMacroFromCollection
};