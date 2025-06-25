import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import { serverConfig } from "src/config/server-config.js";
import { getFolderPath } from "../../api/audio/folders/folderModel.js";
import {
  isExplicitYoutubePlaylist,
  downloadYouTubePlaylist,
  downloadYouTubeSingle,
  downloadDirectUrl,
} from "./downloadFunctions.js";
import type { CompleteMessage, WorkerErrorMessage } from "./types.js";
import { FOLDERS } from "../../api/audio/folders/constants.js";

async function executeDownload() {
  const { jobId, fileData } = workerData;

  const folderId = fileData.folder_id || FOLDERS.UPLOAD;

  try {
    const folderPath = await getFolderPath(folderId);
    
    const absoluteOutputPath = path.join(
      serverConfig.publicDir,
      folderPath
    );
    fs.mkdirSync(absoluteOutputPath, { recursive: true });

    const url = fileData.url;

    let downloadedFileData = null;
    
    // Execute the appropriate download function
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
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
      file: downloadedFileData, // null for batch downloads
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
    throw error;
  }
}

// Start the download process
executeDownload().catch((err) => {
  console.error("Worker error:", err);
  process.exit(1);
});
