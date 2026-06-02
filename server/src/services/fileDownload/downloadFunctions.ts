import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import pLimit from "p-limit";
import { parentPort } from "worker_threads";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import * as mm from "music-metadata";
import ytDlp, { YtResponse } from "yt-dlp-exec";
import fileModel from "src/api/audio/files/fileModel.js";
import fileService from "../../api/audio/files/fileService.js";
import { toRelativePath } from "../../utils/path-utils.js";
import { sanitizeName } from "src/utils/file-utils.js";
import { ProgressMessage, ItemErrorMessage, MetadataMessage } from "./types.js";
import { AudioType } from "shared/audio/types.js";

interface PlaylistEntry {
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
}

interface YtPlaylistResponse extends YtResponse {
  entries: (PlaylistEntry | null)[];
}

export interface FileData {
  name: string;
  url: string;
  folder_id: number;
  audio_type?: AudioType;
}

const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".mpeg", ".opus", ".ogg", ".oga", ".wav", ".aac",
  ".caf", ".m4a", ".mp4", ".weba", ".webm", ".dolby", ".flac",
]);

export function isYoutubeUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return (protocol === "http:" || protocol === "https:") &&
      (hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com"));
  } catch {
    return false;
  }
}

export function isExplicitYoutubePlaylist(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isYoutubeUrl(url) && parsed.pathname === "/playlist" && parsed.searchParams.has("list");
  } catch {
    return false;
  }
}

/** Publish a finished download without replacing another library file. */
async function ingestDownloadedAudio(
  fileData: FileData,
  folderPath: string,
  sourcePath: string,
  title: string,
  duration?: number
) {
  const extension = path.extname(sourcePath).toLowerCase();
  const titleExtension = path.extname(title).toLowerCase();
  const stem = AUDIO_EXTENSIONS.has(titleExtension)
    ? title.slice(0, -titleExtension.length)
    : title;
  const name = sanitizeName(stem, 128);
  // Respect both the physical filename limit and files.rel_path VARCHAR(256).
  const relativeFolder = toRelativePath(folderPath);
  const maxNameBytes = Math.min(128, 255 - Buffer.byteLength(extension),
    256 - Array.from(relativeFolder).length - 1 - extension.length);
  if (maxNameBytes < 4) {
    throw new Error("Download folder path is too long to store in the audio library");
  }

  let filepath: string;
  let storedName: string;
  let duplicate = 0;
  // Copy across filesystems under a non-audio extension, then atomically publish
  // a hard link in the same directory. Scans only see complete audio files.
  const pendingPath = path.join(folderPath, ".download-" + randomUUID() + ".part");
  try {
    await fs.promises.copyFile(sourcePath, pendingPath, fs.constants.COPYFILE_EXCL);
    for (;;) {
      const suffix = duplicate === 0 ? "" : ` (${duplicate})`;
      if (maxNameBytes - Buffer.byteLength(suffix) < 4) {
        throw new Error("Download folder path is too long for a unique filename");
      }
      storedName = sanitizeName(name, maxNameBytes - Buffer.byteLength(suffix)) + suffix;
      filepath = path.join(folderPath, storedName + extension);
      try {
        // link fails with EEXIST atomically, including across worker threads.
        await fs.promises.link(pendingPath, filepath);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        duplicate++;
      }
    }
  } finally {
    await fs.promises.rm(pendingPath, { force: true });
  }

  let insertId: number;
  try {
    const result = await fileService.insertAudioFiles([{
      name: storedName,
      rel_path: toRelativePath(filepath),
      url: fileData.url,
      folder_id: fileData.folder_id,
      duration: duration !== undefined && Number.isFinite(duration) ? duration : null,
      audio_type: fileData.audio_type,
    }]);
    insertId = result.insertId;
  } catch (error) {
    // This path belongs exclusively to this download; existing files stay intact.
    await fs.promises.rm(filepath, { force: true });
    throw error;
  }

  const file = await fileModel.getAudioFile(insertId);
  if (!file) throw new Error("Failed to retrieve file data after download");
  return file;
}

/** Find the postprocessed file, whose extension can differ from yt-dlp's metadata. */
async function findAudioFile(directory: string): Promise<string> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const entry = entries.find((item) =>
    item.isFile() && AUDIO_EXTENSIONS.has(path.extname(item.name).toLowerCase())
  );
  if (!entry) throw new Error("Failed to find converted audio file. Download failed.");
  return path.join(directory, entry.name);
}

async function downloadAndProcessYtAudio(fileData: FileData, folderPath: string) {
  // A private directory avoids collisions and keeps partial files out of library scans.
  const directory = await fs.promises.mkdtemp(path.join(tmpdir(), "audio-download-"));
  try {
    const info = await ytDlp(fileData.url, {
      format: "bestaudio[ext=m4a]/bestaudio",
      extractAudio: true,
      audioQuality: 0,
      hlsPreferFfmpeg: true,
      output: path.join(directory, "audio.%(ext)s"),
      printJson: true,
      noPlaylist: true,
    });
    const metadata = Array.isArray(info) ? info[0] as YtResponse | undefined : info;
    const sourcePath = await findAudioFile(directory);
    return await ingestDownloadedAudio(fileData, folderPath, sourcePath,
      fileData.name || metadata?.title || "audio", metadata?.duration);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

/** Download a playlist with bounded concurrency and an outcome for every entry. */
export async function downloadYouTubePlaylist(fileData: FileData, folderPath: string): Promise<void> {
  if (!fileData.url) throw new Error("Missing URL");

  const playlistInfo = (await ytDlp(fileData.url, {
    dumpSingleJson: true,
    skipDownload: true,
    flatPlaylist: true,
  })) as YtPlaylistResponse;
  if (!Array.isArray(playlistInfo.entries)) throw new Error("Failed to get playlist entries");

  const total = playlistInfo.entries.length;
  parentPort?.postMessage({ type: "metadata", totalFiles: total } as MetadataMessage);
  const limit = pLimit(4);
  let completed = 0;

  await Promise.all(playlistInfo.entries.map((entry) => limit(async () => {
    const title = entry?.title;
    let videoUrl = entry?.webpage_url || entry?.url;
    // Some flat playlist extractors return a video ID instead of a full URL.
    const videoId = videoUrl || entry?.id;
    if (videoId && /^[\w-]+$/.test(videoId)) {
      videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }
    try {
      if (!videoUrl) throw new Error("Playlist entry has no video URL");
      const file = await downloadAndProcessYtAudio({
        ...fileData,
        url: videoUrl,
        name: title || "",
      }, folderPath);
      completed++;
      parentPort?.postMessage({
        type: "progress", file, index: completed, total,
      } as ProgressMessage);
    } catch (error) {
      completed++;
      parentPort?.postMessage({
        type: "item-error",
        index: completed,
        total,
        error: error instanceof Error ? error.message : String(error),
        title,
        url: videoUrl,
      } as ItemErrorMessage);
    }
  })));
}

export async function downloadYouTubeSingle(fileData: FileData, folderPath: string) {
  if (!fileData.url) throw new Error("Missing URL");
  return downloadAndProcessYtAudio(fileData, folderPath);
}

function decodeFilename(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function responseFilename(response: Response, url: string): string {
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = /filename\*\s*=\s*(?:UTF-8)?'[^']*'([^;\r\n]+)/i.exec(disposition);
  if (encoded?.[1]) return decodeFilename(encoded[1].trim());
  const plain = /filename\s*=\s*(?:"([^"]+)"|([^;\r\n]+))/i.exec(disposition);
  if (plain) return (plain[1] || plain[2]).trim().replace(/^'(.*)'$/, "$1");
  return decodeFilename(path.posix.basename(new URL(response.url || url).pathname));
}

function directAudioExtension(filename: string, contentType: string, requestedName: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension)) return extension;
  const mimeExtensions: Record<string, string> = {
    "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a", "video/mp4": ".mp4",
    "audio/wav": ".wav", "audio/wave": ".wav", "audio/x-wav": ".wav",
    "audio/ogg": ".ogg", "application/ogg": ".ogg", "audio/opus": ".opus",
    "audio/aac": ".aac", "audio/x-aac": ".aac", "audio/flac": ".flac",
    "audio/x-flac": ".flac", "audio/webm": ".webm", "video/webm": ".webm",
    "audio/x-caf": ".caf",
  };
  const requestedExtension = path.extname(requestedName || "").toLowerCase();
  return mimeExtensions[contentType.split(";")[0].trim().toLowerCase()] ||
    (AUDIO_EXTENSIONS.has(requestedExtension) ? requestedExtension : ".mp3");
}

export async function downloadDirectUrl(fileData: FileData, folderPath: string) {
  if (!fileData.url) throw new Error("Missing URL");
  const response = await fetch(fileData.url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  if (!response.body) throw new Error("Response body is null");

  const filename = responseFilename(response, fileData.url);
  const contentType = response.headers.get("content-type") || "";
  if (/^(text\/|application\/(?:json|xml))/i.test(contentType)) {
    await response.body.cancel();
    throw new Error("URL returned a document instead of an audio file");
  }
  const extension = directAudioExtension(filename, contentType, fileData.name);
  const directory = await fs.promises.mkdtemp(path.join(tmpdir(), "audio-download-"));
  try {
    const sourcePath = path.join(directory, "audio" + extension);
    // pipeline propagates errors from both the HTTP body and the file writer.
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      fs.createWriteStream(sourcePath, { flags: "wx" })
    );
    if ((await fs.promises.stat(sourcePath)).size === 0) {
      throw new Error("Downloaded audio file is empty");
    }

    let duration: number | undefined;
    try {
      const metadata = await mm.parseFile(sourcePath, { duration: true, skipCovers: true });
      duration = metadata.format.duration;
    } catch (error) {
      console.warn("Unable to read downloaded audio duration:", error);
    }
    return await ingestDownloadedAudio(fileData, folderPath, sourcePath,
      fileData.name || filename || "audio", duration);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}
