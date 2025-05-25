// server/src/socket/namespaces/audio.ts
import { getSocketIO } from "../../index.js";
import { transformAudioFileToDTO } from "../../../utils/format-transformers.js";
import { AudioEventTypes } from "shared/sockets/audio/events.js";
import { AudioFileDB } from "../../../api/audio/files/types.js";
import {
  DownloadProgressDTO,
  DownloadItemErrorDTO,
  DownloadJobErrorDTO,
  DownloadSocketEvent,
  AudioFileDTO,
  DownloadMetadataDTO,
} from "shared/DTO/files.js";


// Utility functions for emitting events from outside socket handlers
export const emitAudioDownloadProgress = (
  jobId: string,
  audioFile: AudioFileDB,
  index: number,
  total: number
): void => {
  const io = getSocketIO();
  const file = transformAudioFileToDTO(audioFile);

  const event: DownloadSocketEvent<DownloadProgressDTO<AudioFileDTO>> = {
    type: "DownloadProgress",
    payload: {
      jobId,
      file,
      fileIndex: index,
      totalFiles: total,
      downloadType: "audio",
    },
  };

  console.log(
    `[SOCKET] Emitting download status for file ID: ${audioFile.audio_file_id}`
  );

  io.of("/download").emit(AudioEventTypes.FILE_DOWNLOAD_STATUS, event);
};

export function emitAudioDownloadItemFailed(
  jobId: string,
  folderId: number,
  index: number,
  total: number,
  error: string,
  title?: string,
  url?: string
) {
  const io = getSocketIO();

  const event: DownloadSocketEvent<DownloadItemErrorDTO<AudioFileDTO>> = {
    type: "DownloadItemError",
    payload: {
      jobId,
      folderId,
      fileIndex: index,
      totalFiles: total,
      errorMessage: error,
      title,
      url,
      downloadType: "audio",
    },
  };

  io.of("/download").emit(AudioEventTypes.FILE_DOWNLOAD_STATUS, event);
}

export const emitAudioDownloadFailed = (
  jobId: string,
  folderId: number,
  error: string
): void => {
  const io = getSocketIO();

  console.log(`[SOCKET] Emitting download failed for job ID: ${jobId}`);

  const event: DownloadSocketEvent<DownloadJobErrorDTO<AudioFileDTO>> = {
    type: "DownloadJobError",
    payload: { jobId, folderId, errorMessage: error, timestamp: new Date().toISOString(), downloadType: "audio" },
  };

  io.of("/download").emit(AudioEventTypes.FILE_DOWNLOAD_STATUS, event);
};

export const emitAudioDownloadMetadata = (
  jobId: string,
  total?: number,
  estimatedTime?: number,
  totalSize?: number,
): void => {
  const io = getSocketIO();
  const event: DownloadSocketEvent<DownloadMetadataDTO> = {
    type: "DownloadMetadata",
    payload: { jobId, totalFiles: total, estimatedTime, totalSize, downloadType: "audio" },
  };

  io.of("/download").emit(AudioEventTypes.FILE_METADATA_FETCHED, event);
};
