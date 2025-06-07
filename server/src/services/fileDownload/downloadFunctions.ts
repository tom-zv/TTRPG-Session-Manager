import fs from "fs";
import path from "path";
import pLimit from "p-limit"
import { parentPort } from "worker_threads";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import * as mm from "music-metadata";
import ytDlp, { YtResponse } from "yt-dlp-exec";
import fileModel from "src/api/audio/files/fileModel.js";
import fileService from "../../api/audio/files/fileService.js";
import { 
  relativePathFromAbsolute,
  sanitizeFilename,
} from "../../utils/path-utils.js";
import { ProgressMessage, ItemErrorMessage, MetadataMessage } from "./types.js";


// Interfaces and types
interface YtPlaylistResponse extends YtResponse {
  entries: {
    title: string;
    url: string;
    webpage_url: string;
  }[];
}

export interface FileData {
  name: string;
  url: string;
  folder_id: number;
}

export function isExplicitYoutubePlaylist(url: string): boolean {
  try {
    const u = new URL(url);
    return (  // Only treat true '/playlist' paths as playlists (not any URL with '&list=')
      (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") &&
      u.pathname === "/playlist" &&
      u.searchParams.has("list")
    );
  } catch {
    return false;
  }
}

async function downloadYtAudio(
  url: string,
  outputPath: string
): Promise<YtResponse> {
  return ytDlp(url, {
    extractAudio: true,
    audioQuality: 0,
    output: outputPath,
    printJson: true,
    noPlaylist: true,
  });
}

function findAudioFileExt(basePath: string): string | null {
  // All formats supported by the playback framework, howler.js
  const possibleExtensions = [
    "mp3",
    "mpeg",
    "opus",
    "ogg",
    "oga",
    "wav",
    "aac",
    "caf",
    "m4a",
    "mp4",
    "weba",
    "webm",
    "dolby",
    "flac",
  ];
  for (const ext of possibleExtensions) {
    const testPath = `${basePath}.${ext}`;
    if (fs.existsSync(testPath)) return `${path.basename(basePath)}.${ext}`;
  }
  return null;
}

/**
 * Process a single downloaded yt audio file
 */
async function processDownloadedYtAudio(
  videoUrl: string,
  outputPath: string,
  metadata: {
    title: string;
  }
) {
  const info = await downloadYtAudio(videoUrl, outputPath);

  const name =
    metadata.title || (Array.isArray(info) ? info[0].title : info.title);
  const duration = Array.isArray(info) ? info[0].duration : info.duration;

  // Extract filename details
  const originalFilename = path.basename(
    Array.isArray(info) ? info[0]._filename : info._filename
  );
  const baseFilename =
    originalFilename.substring(0, originalFilename.lastIndexOf(".")) ||
    originalFilename;

  // Find the actual file with correct extension
  const basePath = path.join(path.dirname(outputPath), baseFilename);
  const resolvedFileName = findAudioFileExt(basePath);

  if (!resolvedFileName) {
    throw new Error(
      `[FILE DOWNLOAD] Failed to find converted audio file for "${baseFilename}". Download failed.`
    );
  }

  const relativePath = path.join(
    path.dirname(relativePathFromAbsolute(outputPath)),
    resolvedFileName
  );

  // Return processed info for database operations
  return {
    name,
    path: relativePath,
    duration,
  };
}

/**
 * Downloads and processes a YouTube playlist
 */
export async function downloadYouTubePlaylist(fileData: FileData, folderPath: string): Promise<void> {
  if (!fileData.url) {
    return;
  }

  const playlistInfo = (await ytDlp(fileData.url, {
    dumpSingleJson: true,
    skipDownload: true,
    flatPlaylist: true,
  })) as YtPlaylistResponse;

  if (!Array.isArray(playlistInfo.entries)) {
    throw new Error("Failed to get playlist entries");
  }

  // Update client with metadata
  parentPort?.postMessage({
    type: "metadata",
    totalFiles: playlistInfo.entries.length,
  } as MetadataMessage);

  const limit = pLimit(4);

  const entries = playlistInfo.entries;
  const total = entries.length;

  // Process videos concurrently with a limit
  const downloadPromises = entries.map((entry, i) => {
    return limit(async () => {
      const { url, webpage_url, title } = entry;
      const videoUrl = url ?? webpage_url;

      if (!videoUrl) {
        return;
      }

      try {
        // Sanitize the video title
        const safeTitle = sanitizeFilename(title);
        const outputFormat = `${folderPath}/${safeTitle}.%(ext)s`;

        const processedFile = await processDownloadedYtAudio(
          videoUrl,
          outputFormat,
          {
            title: safeTitle,
          }
        );

        // Insert into DB
        const { insertId: fileId } = await fileService.createAudioFile({
          name: processedFile.name,
          rel_path: processedFile.path,
          url: videoUrl,
          folder_id: fileData.folder_id,
          duration: processedFile.duration,
        });

        const newFileData = await fileModel.getAudioFile(fileId);

        if (newFileData) {
          parentPort?.postMessage({ type:'progress', file: newFileData, index: i + 1, total } as ProgressMessage);
          
        } else {
          // This case might indicate an issue post-DB insert
          parentPort?.postMessage({
            type: "item-error",
            folderId: fileData.folder_id,
            index: i + 1,
            total,
            error: "Failed to retrieve file data after download.",
            title,
            url: videoUrl,
          } as ItemErrorMessage);
          
        }
      } catch (err) {
        parentPort?.postMessage({
          type: "item-error",
          folderId: fileData.folder_id,
          index: i + 1,
          total,
          error: err instanceof Error ? err.message : String(err),
          title,
          url: videoUrl,
        } as ItemErrorMessage);
        
      }
    });
  });

  // Wait for all limited promises to resolve
  await Promise.all(downloadPromises);
  
}

/**
 * Downloads and processes a single YouTube video
 */
export async function downloadYouTubeSingle(fileData: FileData, folderPath: string) {
  if (!fileData.url) return;

  const safeName = fileData.name ? sanitizeFilename(fileData.name) : "";

  const outputFormat = safeName
    ? `${folderPath}/${safeName}.%(ext)s`
    : `${folderPath}/%(title)s.%(ext)s`;

  const processedFile = await processDownloadedYtAudio(
    fileData.url,
    outputFormat,
    {
      title: safeName || "",
    }
  );

  const res = await fileService.createAudioFile({
    name: processedFile.name,
    rel_path: processedFile.path,
    url: fileData.url,
    folder_id: fileData.folder_id,
    duration: processedFile.duration,
  });

  // Get updated file record and emit event
  const updatedFile = await fileModel.getAudioFile(res.insertId);

  return updatedFile;
}

/**
 * Downloads and processes a file from a direct URL
 */
export async function downloadDirectUrl(fileData: FileData, folderPath: string) {
  if (!fileData.url) return;

  const res = await fetch(fileData.url);

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  let rawFilename = fileData.name;
  if (!rawFilename) {
    // Try Content-Disposition
    const cd = res.headers.get("content-disposition");
    if (cd) {
      const m = /filename[^;=\n]*=(['"]?)([^'";]+)\1/.exec(cd);
      if (m?.[2]) rawFilename = m[2];
    }
    // Fallback to URL path
    if (!rawFilename) {
      const parts = new URL(fileData.url).pathname.split("/");
      const last = parts[parts.length - 1];
      if (last && last !== "/") rawFilename = last;
    }
    if (!rawFilename) rawFilename = `audio-${Date.now()}.mp3`;
  }

  // Sanitize the filename
  let filename = sanitizeFilename(rawFilename);

  // Ensure extension
  if (!filename.includes(".")) {
    const ct = res.headers.get("content-type") || "";
    const ext = ct.includes("audio/") ? ct.split("/")[1] : "mp3";
    filename += `.${ext}`;
  }

  const filepath = path.join(folderPath, filename);
  const ws = fs.createWriteStream(filepath);

  if (!res.body) {
    throw new Error("Response body is null");
  }
  const rs = Readable.fromWeb(
    res.body as unknown as NodeReadableStream<Uint8Array>
  );
  await new Promise<void>((resolve, reject) => {
    rs.pipe(ws).on("finish", resolve).on("error", reject);
  });

  const meta = await mm.parseFile(filepath);
  const duration = meta.format?.duration;

  const rel_path = path.join(
    path.dirname(relativePathFromAbsolute(filepath)),
    filename
  );

  const createRes = await fileService.createAudioFile({
    name: filename,
    rel_path,
    url: fileData.url,
    folder_id: fileData.folder_id,
    duration: duration,
  });

  // Get updated file record and emit event
  const updatedFile = await fileModel.getAudioFile(createRes.insertId);

  return updatedFile;
}