import { audioPool } from "src/db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";

const MACRO_TABLE = 'sfx_macros';
const MACRO_FILES_TABLE = 'sfx_macro_files';

export async function getAllMacros(): Promise<RowDataPacket[]> {
  const [result] = await audioPool.execute(
    `SELECT m.id as macro_id, m.name, m.description, 
     COUNT(mf.file_id) AS item_count
     FROM ${MACRO_TABLE} m
     LEFT JOIN ${MACRO_FILES_TABLE} mf ON m.id = mf.macro_id
     GROUP BY m.id
     ORDER BY m.name ASC`
  );
  return result as RowDataPacket[];
}

export async function getMacroById(id: number): Promise<RowDataPacket[]> {
  const [result] = await audioPool.execute(
    `SELECT id as collection_id, name, description FROM ${MACRO_TABLE} WHERE id = ?`,
    [id]
  );
  return result as RowDataPacket[];
}

export async function createMacro(name: string, description: string | null): Promise<number> {
  const [result] = await audioPool.execute(
    `INSERT INTO ${MACRO_TABLE} (name, description) VALUES (?, ?)`,
    [name, description]
  );
  return (result as ResultSetHeader).insertId || 0;
}

export async function updateMacro(
  id: number, 
  name?: string, 
  description?: string | null,
  volume?: number
): Promise<number> {
  // Build dynamic query based on provided params
  const updateFields: string[] = [];
  const params: (string | number | null)[] = [];

  if (name !== undefined) {
    updateFields.push('name = ?');
    params.push(name);
  }
  
  if (description !== undefined) {
    updateFields.push('description = ?');
    params.push(description);
  }

  if (volume !== undefined) {
    updateFields.push('volume = ?');
    params.push(volume);
  }

  // If no fields to update, return early
  if (updateFields.length === 0) {
    return 0;
  }

  params.push(id);

  const [result] = await audioPool.execute(
    `UPDATE ${MACRO_TABLE} SET ${updateFields.join(', ')} WHERE id = ?`,
    params
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function deleteMacro(id: number): Promise<number> {
  const [result] = await audioPool.execute(
    `DELETE FROM ${MACRO_TABLE} WHERE id = ?`,
    [id]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function getMacroFiles(macro_id: number): Promise<RowDataPacket[]> {
  const [files] = await audioPool.execute(
    `SELECT af.*, mf.delay, mf.volume 
     FROM files af
     JOIN ${MACRO_FILES_TABLE} mf ON af.id = mf.file_id
     WHERE mf.macro_id = ?
     ORDER BY mf.delay ASC`,
    [macro_id]
  );
  
  return files as RowDataPacket[];
}

export async function addFileToMacro(
  macro_id: number,
  file_id: number,
  delay: number = 0
): Promise<number> {
  try {
    // Insert with default volume of 1.0
    const [result] = await audioPool.execute(
      `INSERT INTO ${MACRO_FILES_TABLE} (macro_id, file_id, delay, volume) 
       VALUES (?, ?, ?, 1.0)`,
      [macro_id, file_id, delay]
    );
    
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 'ER_DUP_ENTRY') {
      return -1; // Special code to indicate duplicate entry
    }
    throw error;
  }
}

export async function addFilesToMacro(
  macro_id: number,
  file_ids: number[]
): Promise<number> {
  try {
    // If no files to add, return early
    if (file_ids.length === 0) {
      return 0;
    }
    
    // Build the values string for the INSERT statement
    const values = file_ids.map(id => `(${macro_id}, ${id}, 0, 1.0)`).join(', ');
    
    // Execute the INSERT statement
    const [result] = await audioPool.execute(
      `INSERT INTO ${MACRO_FILES_TABLE} (macro_id, file_id, delay, volume) 
       VALUES ${values}
       ON DUPLICATE KEY UPDATE macro_id = macro_id`
    );
    
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error) {
    console.error(`Error adding files to macro ${macro_id}:`, error);
    throw error;
  }
}

export async function updateMacroFile(
  macro_id: number,
  file_id: number, 
  delay?: number,
  volume?: number
): Promise<number> {
  // Build dynamic query based on provided params
  const updateFields: string[] = [];
  const params: number[] = [];

  if (delay !== undefined) {
    updateFields.push('delay = ?');
    params.push(delay);
  }

  if (volume !== undefined) {
    updateFields.push('volume = ?');
    params.push(volume);
  }

  // If no fields to update, return early
  if (updateFields.length === 0) {
    return 0;
  }

  // Complete the params array with the WHERE clause parameters
  params.push(macro_id, file_id);
  
  const [result] = await audioPool.execute(
    `UPDATE ${MACRO_FILES_TABLE} SET 
     ${updateFields.join(', ')} 
     WHERE macro_id = ? AND file_id = ?`,
    params
  );
  
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function removeFileFromMacro(
  macro_id: number, 
  file_id: number
): Promise<number> {
  const [result] = await audioPool.execute(
    `DELETE FROM ${MACRO_FILES_TABLE} WHERE macro_id = ? AND file_id = ?`,
    [macro_id, file_id]
  );
  
  return (result as ResultSetHeader).affectedRows || 0;
}

export default {
  getAllMacros,
  getMacroById,
  createMacro,
  updateMacro,
  deleteMacro,
  getMacroFiles,
  addFileToMacro,
  addFilesToMacro,
  updateMacroFile,
  removeFileFromMacro
};