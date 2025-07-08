import {
  AudioFileDB,
  CollectionAudioFileDB,
  CollectionDB,
  FolderDB,
  MacroDB,
} from "src/api/audio/types.js";
import {
  FolderDTO,
  AudioFileDTO,
  AudioMacroDTO,
  AudioCollectionDTO,
} from "shared/DTO/audio/index.js";

// Transform raw database audio file without collection properties
export function audioFileToDTO(
  source: AudioFileDB | CollectionAudioFileDB
): AudioFileDTO {
  return {
    type: "audio",
    id: source.id,
    name: source.name ?? "",
    url: source.url ?? undefined,
    path: source.rel_path ?? undefined,
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

export function macroToDTO(macroDB: MacroDB): AudioMacroDTO {
  // Parse the files field if it exists
  let nestedFiles: AudioFileDTO[] = [];
  
  if (macroDB.files) {
    try {
      // Handle case where files is already an array of objects
      if (Array.isArray(macroDB.files)) {
        nestedFiles = macroDB.files.map((fileObj: CollectionAudioFileDB) => ({
          id: fileObj.id,
          type: "audio",
          audioType: fileObj.audio_type,
          name: fileObj.name,
          url: fileObj.url ?? undefined,
          path: fileObj.rel_path ?? undefined,
          folderId: fileObj.folder_id,
          addedAt: fileObj.added_at,
          duration: fileObj.duration ?? 0,
          volume: fileObj.volume,
          delay: fileObj.delay,
          active: fileObj.active,
          position: fileObj.position,
        }));
      } 
      // Handle case where files is a string from GROUP_CONCAT in SQL
      else if (typeof macroDB.files === 'string') {
        // Convert the comma-separated JSON objects into a proper JSON array
        const jsonArrayString = "[" + macroDB.files + "]";
        
        // Parse the entire array at once
        const filesArray = JSON.parse(jsonArrayString);
        
        // Transform each nested file with both file and collection properties
        nestedFiles = filesArray.map((fileObj: CollectionAudioFileDB) => ({
          id: fileObj.id,
          type: "file",
          audioType: fileObj.audio_type,
          name: fileObj.name,
          url: fileObj.url,
          path: fileObj.rel_path,
          folderId: fileObj.folder_id,
          duration: fileObj.duration,
          volume: fileObj.volume,
          delay: fileObj.delay,
        }));
      }
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
    id: macroDB.id,
    type: "macro",
    name: macroDB.name,
    description: macroDB.description ?? undefined,
    volume: macroDB.volume || 1.0,
    duration: MacroDuration,
    position: macroDB.position,
    itemCount: macroDB.item_count,
    items: nestedFiles,
  };
}

export function collectionToDTO(
  collectionDB: CollectionDB
): AudioCollectionDTO {
  return {
    id: collectionDB.id,
    type: collectionDB.type,
    name: collectionDB.name,
    description: collectionDB.description ?? undefined,
    itemCount: collectionDB.item_count,
    position: collectionDB.position,
  };
}

export function folderToDTO(folderDB: FolderDB): FolderDTO {
  return {
    id: folderDB.id,
    name: folderDB.name,
    type: folderDB.folder_type,
    parentId: folderDB.parent_id,
  };
}
