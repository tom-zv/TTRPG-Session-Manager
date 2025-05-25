import {
  AudioFileDB,
  CollectionAudioFileDB,
  CollectionDB,
  FolderDB,
  MacroDB,
} from "src/api/audio/files/types.js";
import {
  FolderDTO,
  AudioFileDTO,
  AudioMacroDTO,
  AudioCollectionDTO,
} from "shared/DTO/index.js";

// Transform raw database audio file without collection properties
export function transformAudioFileToDTO(
  source: AudioFileDB | CollectionAudioFileDB
): AudioFileDTO {
  return {
    type: "audio",
    id: source.audio_file_id,
    name: source.name ?? "",
    url: source.file_url ?? undefined,
    path: source.file_path ?? undefined,
    folderId: source.folder_id,
    addedAt: source.added_at,
    audioType: source.audio_type,
    duration: source.duration ?? 0,

    position: (source as CollectionAudioFileDB).position,
    volume: (source as CollectionAudioFileDB).volume,
    delay: (source as CollectionAudioFileDB).delay,
    active: (source as CollectionAudioFileDB).active,
  };
}

export function transformMacro(macroDB: MacroDB): AudioMacroDTO {
  // Parse the files field if it exists
  let nestedFiles: AudioFileDTO[] = [];
  if (macroDB.files) {
    try {
      // Convert the comma-separated JSON objects into a proper JSON array
      const jsonArrayString = "[" + macroDB.files + "]";

      // Parse the entire array at once
      const filesArray = JSON.parse(jsonArrayString);

      // Transform each nested file with both file and collection properties
      nestedFiles = filesArray.map((fileObj: CollectionAudioFileDB) => ({
        // Audio file properties
        id: fileObj.audio_file_id,
        type: "file",
        audioType: fileObj.audio_type,
        name: fileObj.name,
        url: fileObj.file_url,
        path: fileObj.file_path,
        folderId: fileObj.folder_id,
        duration: fileObj.duration,
        // Collection properties
        volume: fileObj.volume,
        delay: fileObj.delay,
      }));
    } catch (error) {
      console.error("Error parsing macro files:", error);
      nestedFiles = [];
    }
  }

  let MacroDuration = 0;
  for (const file of nestedFiles) {
    const fileDuration = (file.duration || 0) + (file.delay || 0) / 1000;
    MacroDuration = Math.max(MacroDuration, fileDuration);
  }

  return {
    id: macroDB.macro_id,
    type: "macro",
    name: macroDB.name,
    description: macroDB.description ?? undefined,
    volume: macroDB.volume,
    duration: MacroDuration,
    position: macroDB.position,
    itemCount: macroDB.item_count,
    items: nestedFiles,
  };
}

export function transformCollection(
  collectionDB: CollectionDB
): AudioCollectionDTO {
  return {
    id: collectionDB.collection_id,
    type: collectionDB.type,
    name: collectionDB.name,
    description: collectionDB.description ?? undefined,
    itemCount: collectionDB.item_count,
    position: collectionDB.position,
  };
}

export function transformFolder(folderDB: FolderDB): FolderDTO {
  return {
    id: folderDB.folder_id,
    name: folderDB.name,
    type: folderDB.folder_type,
    parentId: folderDB.parent_folder_id,
  };
}
