import fileModel from "../api/audio/files/fileModel.js";
import { getFolderPath } from "src/api/audio/folders/folderModel.js";
import ytDlp from "yt-dlp-exec";
import fs from "fs";
import { Readable } from "stream";
import path from "path";
import { FOLDERS } from '../constants/folders.js';

export async function downloadAudioFile(id: number): Promise<void> {
  const audioFile = await fileModel.getAudioFile(id);

  if (!audioFile) {
    throw new Error(`Audio file with ID ${id} not found`);
  }

  if (!audioFile.file_url) {
    throw new Error(`Audio file with ID ${id} does not have a file URL`);
  }

  // Use default folder ID if none provided
  const folderId = audioFile.folder_id || FOLDERS.UPLOAD;
  const folderPath = await getFolderPath(folderId);
  let outputPath = folderPath;

  if (
    audioFile.file_url.includes("youtube.com") ||
    audioFile.file_url.includes("youtu.be")
  ) {
    // Handle yt URL download logic here
    const file = await ytDlp(audioFile.file_url, {
      extractAudio: true,
      audioQuality: 0,
      output: audioFile.name
        ? `${outputPath}/${audioFile.name}.%(ext)s`
        : `${outputPath}/%(title)s.%(ext)s`,
    });
    if (!file) {
      throw new Error(
        `Failed to download audio file from YouTube URL: ${audioFile.file_url}`
      );
    }
  } else { // Handle 'default' audio URLs
    const res = await fetch(audioFile.file_url);

    if (!res.ok) {
      throw new Error(
        `Failed to download file: ${res.status} ${res.statusText}`
      );
    }

    // Determine filename
    let filename = audioFile.name;

    if (!filename) {
      // Try to get filename from Content-Disposition header
      const contentDisposition = res.headers.get("content-disposition");
      if (contentDisposition) {
        const filenameMatch = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(
          contentDisposition
        );
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, "");
        }
      }

      // If still no filename, extract it from URL
      if (!filename) {
        const urlParts = new URL(audioFile.file_url).pathname.split("/");
        filename = urlParts[urlParts.length - 1];
      }
    }

    // Ensure filename has extension
    if (!filename.includes(".")) {
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("audio/")) {
        const ext = contentType.includes("mp3")
          ? ".mp3"
          : contentType.includes("ogg")
            ? ".ogg"
            : contentType.includes("wav")
              ? ".wav"
              : contentType.includes("flac")
                ? ".flac"
                : ".mp3";
        filename += ext;
      } else {
        filename += ".mp3"; // Default audio extension
      }
    }

    // Create full filepath
    const filepath = path.join(outputPath, filename);

    // Save the file
    const fileStream = fs.createWriteStream(filepath);

    const readableStream = Readable.fromWeb(res.body as any);
    await new Promise<void>((resolve, reject) => {
      readableStream
        .pipe(fileStream)
        .on("finish", () => resolve())
        .on("error", reject);
    });

    // Update the audio file record with the local path and name
    await fileModel.updateAudioFile(id, { name: filename, file_path: filepath });
  }
}
