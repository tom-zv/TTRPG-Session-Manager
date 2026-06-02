import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import { serverConfig } from "src/config/server-config.js";
import { getFolderPath } from "../../api/audio/folders/folderModel.js";
import { audioPool } from "../../db.js";
import {
  isExplicitYoutubePlaylist,
  isYoutubeUrl,
  downloadYouTubePlaylist,
  downloadYouTubeSingle,
  downloadDirectUrl,
} from "./downloadFunctions.js";
import type { CompleteMessage, WorkerErrorMessage } from "./types.js";
import { FOLDERS } from "../../api/audio/folders/constants.js";

async function executeDownload() {
  const { jobId } = workerData;
  const folderId = workerData.fileData.folder_id || FOLDERS.UPLOAD;
  const fileData = { ...workerData.fileData, folder_id: folderId };

  try {
    const folderPath = await getFolderPath(folderId);
    
    const absoluteOutputPath = path.join(
      serverConfig.publicDir,
      folderPath
    );
    const relativeOutputPath = path.relative(serverConfig.audioDir, absoluteOutputPath);
    if (relativeOutputPath === ".." || relativeOutputPath.startsWith(".." + path.sep) ||
      path.isAbsolute(relativeOutputPath)) {
      throw new Error("Download folder must be inside the audio library");
    }
    fs.mkdirSync(absoluteOutputPath, { recursive: true });

    const url = fileData.url;

    let downloadedFileData: CompleteMessage["file"];
    
    // Execute the appropriate download function
    if (isYoutubeUrl(url)) {
      if (isExplicitYoutubePlaylist(url)) {
        await downloadYouTubePlaylist(fileData, absoluteOutputPath);
      } else {
        downloadedFileData = await downloadYouTubeSingle(fileData, absoluteOutputPath);
      }
    } else {
      downloadedFileData = await downloadDirectUrl(fileData, absoluteOutputPath);
    }

    parentPort?.postMessage({
      type: "complete",
      jobId,
      file: downloadedFileData,
    } as CompleteMessage);

  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Error",
      stack: error instanceof Error ? error.stack : undefined,
    };
    
    parentPort?.postMessage({ 
      type: "error", 
      jobId, 
      folderId,
      error: errorDetails 
    } as WorkerErrorMessage);
  } finally {
    await audioPool.end();
    parentPort?.close();
  }
}

// Start the download process
executeDownload().catch((err) => {
  console.error("Worker error:", err);
  process.exit(1);
});
