import fileModel from "../api/audio/files/fileModel.js";
import { getFolderPath } from "src/api/audio/folders/folderModel.js";
import ytDlp, { YtResponse } from "yt-dlp-exec";
import fs from "fs";
import { Readable } from "stream";
import path from "path";
import { FOLDERS } from "../constants/folders.js";
import { serverRoot, sanitizeFilename } from "../utils/path-utils.js";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { emitFileDownloaded } from "../socket/namespaces/audio.js";
import { AudioFileDB } from "src/api/audio/files/types.js";
import { relativePathFromAbsolute } from "../utils/path-utils.js";

interface YtPlaylistResponse extends YtResponse {
  entries: {
    title: string;
    url: string;
    webpage_url: string;
  }[];
}

// Only treat true '/playlist' paths as playlists (not any URL with '&list=')
function isExplicitYoutubePlaylist(url: string): boolean {
  try {
    const u = new URL(url);
    return (
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
  const possibleExtensions = ["mp3", "mpeg", "opus", "ogg", "oga", "wav", "aac", "caf", "m4a", "mp4", "weba", "webm", "dolby", "flac"];
  for (const ext of possibleExtensions) {
    const testPath = `${basePath}.${ext}`;
    if (fs.existsSync(testPath)) return `${path.basename(basePath)}.${ext}`;
  }
  return null;
}

/**
 * Process a single downloaded YouTube audio file
 */
async function processDownloadedAudio(
  videoUrl: string,
  outputPath: string,
  metadata: {
    title: string;
    audioType: string;
    folderId: number;
    existingFileId?: number;
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
    throw new Error(`[FILE DOWNLOAD] Failed to find converted audio file for "${baseFilename}". Download failed.`);
  }

  const relativePath = path.join(
    path.dirname(relativePathFromAbsolute(outputPath)),
    resolvedFileName
  );

  // Return processed info for database operations
  return {
    name,
    filePath: relativePath,
    duration,
  };
}

/**
 * Downloads and processes a YouTube playlist
 */
async function downloadYouTubePlaylist(
  audioFile: AudioFileDB,
  folderPath: string
) {
  if (!audioFile.file_url) return;

  console.log(`[FILE DOWNLOAD] Getting playlist information...`);

  const playlistInfo = (await ytDlp(audioFile.file_url, {
    dumpSingleJson: true,
    skipDownload: true,
    flatPlaylist: true,
  })) as YtPlaylistResponse;

  if (!Array.isArray(playlistInfo.entries)) {
    throw new Error("Failed to get playlist entries");
  }

  console.log(
    `[FILE DOWNLOAD] Found ${playlistInfo.entries.length} videos in playlist`
  );
  const newFileIds: number[] = [];

  // Process videos one by one
  for (const entry of playlistInfo.entries) {
    const videoUrl = entry.url || entry.webpage_url;
    if (!videoUrl) continue;

    // Sanitize the video title
    const safeTitle = sanitizeFilename(entry.title);
    console.log(`[FILE DOWNLOAD] Processing video: ${safeTitle}`);
    const outputFormat = `${folderPath}/${safeTitle}.%(ext)s`;

    const processedFile = await processDownloadedAudio(videoUrl, outputFormat, {
      title: safeTitle,
      audioType: audioFile.audio_type,
      folderId: audioFile.folder_id,
    });

    // Insert into DB
    const { insertId: fileId } = await fileModel.insertAudioFile(
      processedFile.name,
      audioFile.audio_type,
      processedFile.filePath,
      videoUrl,
      audioFile.folder_id,
      processedFile.duration
    );

    const newFile = await fileModel.getAudioFile(fileId);
    if (newFile) {
      emitFileDownloaded(newFile);
    }

    newFileIds.push(fileId);
  }

  // Delete the original placeholder
  await fileModel.deleteAudioFile(audioFile.audio_file_id);
}

/**
 * Downloads and processes a single YouTube video
 */
async function downloadYouTubeSingle(
  audioFile: AudioFileDB,
  folderPath: string
) {
  if (!audioFile.file_url) return;

  const safeName = audioFile.name ? sanitizeFilename(audioFile.name) : "";
  const outputFormat = safeName
    ? `${folderPath}/${safeName}.%(ext)s`
    : `${folderPath}/%(title)s.%(ext)s`;

  const processedFile = await processDownloadedAudio(
    audioFile.file_url,
    outputFormat,
    {
      title: safeName || "",
      audioType: audioFile.audio_type,
      folderId: audioFile.folder_id,
      existingFileId: audioFile.audio_file_id,
    }
  );

  await fileModel.updateAudioFile(audioFile.audio_file_id, {
    name: processedFile.name,
    file_path: processedFile.filePath,
    duration: processedFile.duration,
  });

  console.log(
    `[FILE DOWNLOAD] Updated original entry fileId=${audioFile.audio_file_id}, path=${processedFile.filePath}`
  );

  // Get updated file record and emit event
  const updatedFile = await fileModel.getAudioFile(audioFile.audio_file_id);
  if (updatedFile) {
    emitFileDownloaded(updatedFile);
  }
}

/**
 * Downloads and processes a file from a direct URL
 */
async function downloadDirectUrl(audioFile: AudioFileDB, folderPath: string) {
  if (!audioFile.file_url) return;

  console.log(`[FILE DOWNLOAD] Direct URL, fetching via HTTP`);
  const res = await fetch(audioFile.file_url);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  let rawFilename = audioFile.name;
  if (!rawFilename) {
    // Try Content-Disposition
    const cd = res.headers.get("content-disposition");
    if (cd) {
      const m = /filename[^;=\n]*=(['"]?)([^'";]+)\1/.exec(cd);
      if (m?.[2]) rawFilename = m[2];
    }
    // Fallback to URL path
    if (!rawFilename) {
      const parts = new URL(audioFile.file_url).pathname.split("/");
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

  const relFilePath = path.join(
    path.dirname(relativePathFromAbsolute(filepath)),
    filename
  );

  const updateData: { name?: string; file_path: string } = {
    file_path: relFilePath,
  };

  if (!audioFile.name) updateData.name = filename;
  await fileModel.updateAudioFile(audioFile.audio_file_id, updateData);
  console.log(
    `[FILE DOWNLOAD] Updated DB id=${audioFile.audio_file_id} path=${relFilePath}`
  );

  // Get updated file record and emit event
  const updatedFile = await fileModel.getAudioFile(audioFile.audio_file_id);
  if (updatedFile) {
    emitFileDownloaded(updatedFile);
  }
}

// Main download function
export async function downloadAudioFile(id: number): Promise<void> {
  console.log(`[FILE DOWNLOAD] Starting download for ID: ${id}`);
  const audioFile = await fileModel.getAudioFile(id);

  if (!audioFile) {
    throw new Error(`Audio file with ID ${id} not found`);
  }
  if (!audioFile.file_url) {
    throw new Error(`Audio file with ID ${id} missing file_url`);
  }

  const folderId = audioFile.folder_id || FOLDERS.UPLOAD;
  const folderPath = await getFolderPath(folderId);
  console.log(`[FILE DOWNLOAD] Folder path: ${folderPath}`);

  // Absolute filesystem path for writing files
  const absoluteOutputPath = path.join(serverRoot, "public/audio", folderPath);
  console.log(`[FILE DOWNLOAD] Using output path: ${absoluteOutputPath}`);

  const url = audioFile.file_url;

  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    if (isExplicitYoutubePlaylist(url)) {
      await downloadYouTubePlaylist(audioFile, absoluteOutputPath);
    } else {
      await downloadYouTubeSingle(audioFile, absoluteOutputPath);
    }
  }
  else {
    await downloadDirectUrl(audioFile, absoluteOutputPath);
  }

  console.log(`[FILE DOWNLOAD] Completed download for ID: ${id}`);
}
