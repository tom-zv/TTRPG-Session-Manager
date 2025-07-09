import {
  getAllAudioFiles,
  insertAudioFiles,
} from "src/api/audio/files/fileService.js";
import fs from "fs/promises";
import { Dirent } from "fs";
import path from "path";
import type { AudioFileDB } from "src/api/audio/types.js";
import { serverConfig } from "src/config/server-config.js";
import {
  buildPathToFolderMap,
  FolderInfo,
} from "src/api/audio/folders/folderPathMap.js";
import { FolderType } from "shared/audio/types.js";
import { audioPool } from "src/db.js";

import { toRelativePath } from "./path-utils.js";
import * as mm from "music-metadata";
import fileModel, { FileInsertData } from "src/api/audio/files/fileModel.js";
import folderModel from "src/api/audio/folders/folderModel.js";
import { PoolConnection } from "mysql2/promise";

interface ExistingFileInfo extends AudioFileDB {
  found?: boolean;
}

/**
 * List of supported audio file extensions
 */
const AUDIO_EXTENSIONS = [
  ".mp3",
  ".mpeg",
  ".opus",
  ".m4a",
  ".ogg",
  ".oga",
  ".wav",
  ".aac",
  ".caf",
  ".mp4",
  ".weba",
  ".webm",
  ".dolby",
  ".flac",
];

/**
 * Checks if a file has an audio extension
 */
function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Scans the audio library directory for new audio files and updates the database accordingly.
 * @returns A summary of operations performed
 */
export async function syncAudioLibrary(): Promise<{
  filesAdded: number;
  filesDeleted: number;
  foldersAdded: number;
  foldersDeleted: number;
}> {
  try {
    // Build a map of existing folders in the database
    const pathToExistingFolderMap = await buildPathToFolderMap();

    const files = await getAllAudioFiles();
    const pathToExistingFileMap: Map<string, ExistingFileInfo> = new Map(
      files
        .filter((file) => file.rel_path !== null)
        .map((file) => [file.rel_path!, { ...file, found: false }])
    );

    // Start a transaction for database operations
    const connection = await audioPool.getConnection();
    await connection.beginTransaction();

    try {
      // Scan filesystem and prepare insert arrays
      const result = await scanFsAndBuildInsertArray(
        serverConfig.audioDir,
        pathToExistingFolderMap,
        pathToExistingFileMap,
        connection
      );

      const { fileInsertArray: fileArray, foldersAdded } = result;

      // process files
      let fileInsertResult = { affectedRows: 0 };
      if (fileArray.length > 0) {
        const fileInsertArray = await fetchFileDurations(fileArray);
        fileInsertResult = await insertAudioFiles(fileInsertArray, connection);
      }

      // Delete files and folders that no longer exist
      const foldersToDelete = Array.from(pathToExistingFolderMap.values())
        .filter((folder) => !folder.found)
        .map((folder) => folder.id);

      const filesToDelete = Array.from(pathToExistingFileMap.values())
        .filter((file) => !file.found)
        .map((file) => file.id);

      
      let filesDeleteResult = { deletedCount: 0 };
      let foldersDeleteResult = { deletedCount: 0 };

      if (filesToDelete.length > 0) {
        filesDeleteResult = await fileModel.deleteAudioFiles(filesToDelete);
      }

      if (foldersToDelete.length > 0) {
        foldersDeleteResult = await folderModel.deleteFolders(foldersToDelete);
      }

      await connection.commit();

      return {
        filesAdded: fileInsertResult.affectedRows,
        filesDeleted: filesDeleteResult.deletedCount,
        foldersAdded: foldersAdded,
        foldersDeleted: foldersDeleteResult.deletedCount,
      };
    } catch (error) {
      // Rollback on error
      await connection.rollback();
      console.error("Error during audio library sync transaction:", error);
      if (error instanceof Error) {
        throw new Error(
          `Failed to synchronize audio library: ${error.message}`
        );
      } else {
        throw new Error(
          `Failed to synchronize audio library: ${String(error)}`
        );
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Fatal error in syncAudioLibrary:", error);
    if (error instanceof Error) {
      throw new Error(`Audio library synchronization failed: ${error.message}`);
    } else {
      throw new Error(`Audio library synchronization failed: ${String(error)}`);
    }
  }
}

/**
 * BFS traversing the file system
 * Scan and build the DB insertion arrays directly in one pass.
 * Folders are inserted immediately when discovered.
 */
async function scanFsAndBuildInsertArray(
  rootPath: string,
  pathToExistingFolderMap: Map<string, FolderInfo>,
  pathToExistingFileMap: Map<string, ExistingFileInfo>,
  connection: PoolConnection
): Promise<{
  fileInsertArray: FileInsertData[];
  foldersAdded: number;
}> {
  const fileInsertArray: FileInsertData[] = [];
  let foldersAdded = 0;

  const queue: {
    dirPath: string;
    parentId: number | null;
    parentAudioType: FolderType;
  }[] = [{ dirPath: rootPath, parentId: null, parentAudioType: "root" }];

  while (queue.length) {
    const { dirPath, parentId, parentAudioType } = queue.shift()!;
    const rel_path = toRelativePath(dirPath);

    let audioType = parentAudioType;

    if (parentAudioType === "root") {
      audioType = audioTypeByName(path.basename(rel_path));
    }

    let folderId: number;

    const existingFolder = pathToExistingFolderMap.get(rel_path);

    if (existingFolder) {
      folderId = existingFolder.id;
      existingFolder.found = true;
      audioType = existingFolder.folder_type;
    } else {
      if (parentId == null) {
        // This means the root folder isn't in the DB, error in the folder structure
        throw new Error(`Root folder ${rootPath} is not in the database!`);
      }

      // Insert the folder immediately and get the insert ID
      const folderData = {
        name: path.basename(rel_path),
        type: audioType!,
        parent_id: parentId,
      };

      const insertId = await folderModel.createFolder(folderData, connection);

      if (!insertId) {
        throw new Error(`Failed to create folder ${rel_path}`);
      }

      folderId = insertId;
      foldersAdded++;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      console.warn(`Skipping ${dirPath}:`, err);
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        queue.push({
          dirPath: entryPath,
          parentId: folderId,
          parentAudioType: audioType,
        });
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        const relEntryPath = toRelativePath(entryPath);
        const existingFile = pathToExistingFileMap.get(relEntryPath);

        if (existingFile) {
          existingFile.found = true;
        } else {
          // new file - put into insert structure
          const nameWithoutExt = path.parse(entry.name).name;

          const file: FileInsertData = {
            folder_id: folderId,
            name: nameWithoutExt,
            rel_path: relEntryPath,
            audio_type: audioType === "root" ? "any" : audioType!,
            url: null,
          };

          fileInsertArray.push(file);
        }
      }
    }
  }

  return { fileInsertArray, foldersAdded };
}

/**
 * Fetches and updates audio file durations concurrently
 * @param files Array of audio files to process
 * @returns Array of audio files with duration information
 */
async function fetchFileDurations(
  files: FileInsertData[]
): Promise<FileInsertData[]> {
  // Skip files that don't have a relative path (URL-only files)
  const filesToProcess = files.filter((file) => file.rel_path);

  // Process files in batches
  const BATCH_SIZE = 20;
  const result: FileInsertData[] = [];

  for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
    const batch = filesToProcess.slice(i, i + BATCH_SIZE);

    const processedBatch = await Promise.all(
      batch.map(async (file) => {
        try {
          const fullPath = path.join(serverConfig.publicDir, file.rel_path!);
          // Parse metadata to get duration
          const metadata = await mm.parseFile(fullPath, {
            duration: true,
            skipCovers: true,
            skipPostHeaders: true,
          });

          return {
            ...file,
            duration: metadata.format.duration || null,
          };
        } catch (error) {
          console.warn(`Failed to get duration for ${file.name}:`, error);
          // Return the original file if we couldn't get the duration
          return {
            ...file,
            duration: null,
          };
        }
      })
    );

    result.push(...processedBatch);
  }

  return result;
}

function audioTypeByName(name: string): FolderType {
  switch (name) {
    case "music":
      return "music";
    case "sfx":
      return "sfx";
    case "ambience":
      return "ambience";
    case "audio":
      return "root";
    default:
      return "any";
  }
}
