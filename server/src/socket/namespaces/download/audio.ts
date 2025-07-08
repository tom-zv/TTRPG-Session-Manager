// server/src/socket/namespaces/audio.ts
import { getSocketIO } from "../../index.js";
import { audioFileToDTO } from "../../../utils/format-transformers/audio-transformer.js";
import { AudioEventTypes } from "shared/sockets/audio/events.js";
import { AudioFileDB } from "../../../api/audio/types.js";
import { AudioFileDTO } from "shared/DTO/audio/files.js";
import {
  DownloadProgressDTO,
  DownloadItemErrorDTO,
  DownloadJobErrorDTO,
  DownloadSocketEvent,
  DownloadMetadataDTO,
  DownloadCompleteDTO,
} from "shared/DTO/downloadEvents.js";

// Utility functions for emitting events from outside socket handlers
export const emitAudioDownloadProgress = (
  jobId: string,
  audioFile: AudioFileDB,
  index: number,
  total: number
): void => {
  const io = getSocketIO();
  const file = audioFileToDTO(audioFile);

  const event: DownloadSocketEvent<DownloadProgressDTO<AudioFileDTO>> = {
    type: "DownloadProgress",
    payload: {
      jobId,
      fileIndex: index,
      totalFiles: total,
      downloadType: "audio",
      file,
      timestamp: new Date().toISOString(),
    },
  };

  io.of("/download").emit(AudioEventTypes.FILE_DOWNLOAD_STATUS, event);
};

export const emitAudioDownloadMetadata = (
  jobId: string,
  folderId: number,
  total?: number,
  estimatedTime?: number,
  totalSize?: number
): void => {
  const io = getSocketIO();
  const event: DownloadSocketEvent<DownloadMetadataDTO> = {
    type: "DownloadMetadata",
    payload: {
      jobId,
      folderId,
      totalFiles: total,
      totalSize,
      estimatedTime,
      downloadType: "audio",
      timestamp: new Date().toISOString(),
    },
  };

  io.of("/download").emit(AudioEventTypes.FILE_METADATA_FETCHED, event);
};

export const emitAudioDownloadComplete = (
  jobId: string,
  folderId: number,
  audioFile?: AudioFileDB
  //metadata: unknown,
): void => {
  const io = getSocketIO();

  let file: AudioFileDTO | undefined;

  if (audioFile) {
    file = audioFileToDTO(audioFile);
  }

  const event: DownloadSocketEvent<DownloadCompleteDTO> = {
    type: "DownloadComplete",
    payload: {
      jobId,
      folderId,
      file,
      timestamp: new Date().toISOString(),
      downloadType: "audio",
    },
  };

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
      fileIndex: index,
      totalFiles: total,
      folderId,
      title,
      url,
      errorMessage: error,
      timestamp: new Date().toISOString(),
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

  const event: DownloadSocketEvent<DownloadJobErrorDTO<AudioFileDTO>> = {
    type: "DownloadJobError",
    payload: {
      jobId,
      folderId,
      errorMessage: error,
      timestamp: new Date().toISOString(),
      downloadType: "audio",
    },
  };

  io.of("/download").emit(AudioEventTypes.FILE_DOWNLOAD_STATUS, event);
};
