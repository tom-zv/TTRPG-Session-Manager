import fs from 'fs/promises';
import path from 'path';
import { serverConfig } from '../config/server-config.js';
import { toRelativePath } from './path-utils.js';
import { executeQuery } from '../db.js';

const audioExtensions = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a']);
type AudioType = 'music' | 'sfx' | 'ambience' | 'root';

/**
 * Recursively scan a directory for audio files
 */
async function scanDirectory(
  dirPath: string, 
  folderIdMap: Map<string, number>,
  audioType?: AudioType
): Promise<Array<{
  path: string,
  relativePath: string,
  folderId: number,
  audioType: AudioType
}>> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: Array<{
    path: string;
    relativePath: string;
    folderId: number;
    audioType: AudioType;
  }> = [];

  // Get or create folder ID for this directory
  const relFolderPath = toRelativePath(dirPath);
  console.log(`relative folder path: ${relFolderPath}`);
  let folderId = folderIdMap.get(relFolderPath);

  console.log(
    `Scanning directory: ${dirPath} ID #${folderId}, inherited audioType: ${audioType}`
  );

  // Determine audio type based on top-level folder
  if (!audioType || audioType === "root") {
    if (folderId == 1) {
      audioType = "root";
    } else {
      // Check if this is a top-level folder (music/sfx/ambience)
      const folderName = path.basename(dirPath).toLowerCase();
      if (folderName === "music") {
        audioType = "music";
      } else if (folderName === "sfx") {
        audioType = "sfx";
      } else if (folderName === "ambience") {
        audioType = "ambience";
      } else {
        // Default
        audioType = "music";
      }
    }
  }

  if (!folderId) {
    // This is a new folder we need to add to the database
    const folderName = path.basename(dirPath);
    const parentDir = path.dirname(dirPath);
    const relParentPath = toRelativePath(parentDir);
    const parentId = folderIdMap.get(relParentPath) || null;

    console.log(
      `Adding folder: ${folderName}, parent: ${parentId}, type: ${audioType}`
    );

    // Insert folder into database with the determined or passed-in audioType
    const result = await executeQuery<{ insertId: number }>(
      "INSERT INTO folders (name, parent_folder_id, folder_type) VALUES (?, ?, ?)",
      [folderName, parentId, audioType]
    );

    folderId = result[0]?.insertId;
    folderIdMap.set(relFolderPath, folderId);
  }

  // Process all entries in this directory
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    //console.log(`Processing entry: ${entryPath}`);

    if (entry.isDirectory()) {
      // Recursively scan subdirectory with the same audioType
      const subResults = await scanDirectory(entryPath, folderIdMap, audioType);
      results.push(...subResults);
    } else if (entry.isFile() && isAudioFile(entry.name)) {
      // This is an audio file
      const relativePath = toRelativePath(entryPath);
      results.push({
        path: entryPath,
        relativePath,
        folderId,
        audioType,
      });
    }
  }

  return results;
}

/**
 * Build a map of folder paths to folder IDs
 */
function buildFolderPathMap(folders: Array<{
  folder_id: number,
  name: string,
  parent_folder_id: number | null
}>): Map<string, number> {
  const folderIdMap = new Map<string, number>();
  
  // First create a map of folder_id to folder info for quick lookups
  const folderById = new Map(
    folders.map(folder => [folder.folder_id, folder])
  );
  
  // Function to build the full relative path of a folder
  function buildFolderPath(folderId: number): string {
    const folder = folderById.get(folderId);
    if (!folder) return '';
    
    if (folder.parent_folder_id === null) {
      return folder.name; // Root folder
    }
    
    const parentPath = buildFolderPath(folder.parent_folder_id);
    return path.join(parentPath, folder.name);
  }
  
  // Build paths for all folders and map them to their IDs
  for (const folder of folders) {
    const folderPath = buildFolderPath(folder.folder_id);
    console.log(`Mapped DB folder: "${folderPath}" => ID: ${folder.folder_id}`);
    folderIdMap.set(folderPath, folder.folder_id);
    
    // Also map the actual relative path as it appears in the filesystem
    // This helps when we encounter this folder during scanning
    if (folderPath) {
      const relPath = toRelativePath(path.join(serverConfig.audioDir, '..', folderPath));
      if (relPath !== folderPath) {
        console.log(`Also mapped filesystem path: "${relPath}" => ID: ${folder.folder_id}`);
        folderIdMap.set(relPath, folder.folder_id);
      }
    }
  }
  
  console.log(`Built folder ID map with ${folderIdMap.size} entries`);
  return folderIdMap;
}

/**
 * Check if file is an audio file based on extension
 */
function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return audioExtensions.has(ext);
}

/**
 * Scan audio directory and update database
 */
export async function scanAudioFiles(): Promise<void> {
  try {
    // Get existing folders from database to avoid duplicates
    const folders = await executeQuery<{
      folder_id: number,
      name: string,
      parent_folder_id: number
    }>('SELECT folder_id, name, parent_folder_id FROM folders');
    
    // Build folder ID map using the extracted function
    const folderIdMap = buildFolderPathMap(folders);
    
    // Scan audio directory
    const audioFiles = await scanDirectory(serverConfig.audioDir, folderIdMap);
    
    // Update database with found files
    for (const file of audioFiles) {
      const fileName = path.basename(file.path);
      const fileExt = path.extname(fileName).toLowerCase() || '';
      
      // Check if file already exists in the database
      const existingFiles = await executeQuery<{ audio_file_id: number }>(
        'SELECT audio_file_id FROM audio_files WHERE file_path = ?',
        [file.relativePath]
      );
      
      if (existingFiles.length === 0) {
        // Add new file to database using the audioType determined during scanning
        await executeQuery(
          'INSERT INTO audio_files (title, audio_type, file_path, folder_id) VALUES (?, ?, ?, ?)',
          [fileName.replace(fileExt, ''), file.audioType, file.relativePath, file.folderId]
        );
      }
    }
    
    console.log(`Scan complete. Processed ${audioFiles.length} audio files.`);
  } catch (error) {
    console.error('Error scanning audio files:', error);
  }
}