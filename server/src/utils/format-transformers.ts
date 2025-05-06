//import { AudioFile } from "client/src/components/FolderTree/types.js";
//import { AudioFileDB } from "src/api/audio/files/types.js";

// Transform raw database audio file without collection properties
export function transformAudioFile(dbAudioFile: any) {
  return {
    id: dbAudioFile.audio_file_id,  // DB ID
    audioType: dbAudioFile.audio_type,   // audio type: music, sfx, ambience
    name: dbAudioFile.name, 
    duration: dbAudioFile.duration,
    fileUrl: dbAudioFile.file_url,     // Remote URL for playback
    filePath: dbAudioFile.file_path,   // Local path for file access
    folderId: dbAudioFile.folder_id,   
    addedAt: dbAudioFile.added_at,
    type: "file"
  };
}

// Transform audio file with collection-specific properties
export function transformCollectionFile(dbAudioFile: any) {
  return {
    ...transformAudioFile(dbAudioFile),
    volume: dbAudioFile.volume,
    delay: dbAudioFile.delay,
    position: dbAudioFile.position,
    active: dbAudioFile.active
  };
}

export function transformMacro(dbMacro: any) {
  // Parse the files field if it exists
  let nestedFiles = [];
  if (dbMacro.files) {
    try {
      // Convert the comma-separated JSON objects into a proper JSON array
      const jsonArrayString = '[' + dbMacro.files + ']';
      
      // Parse the entire array at once
      const filesArray = JSON.parse(jsonArrayString);
      
      // Transform each nested file with both file and collection properties
      nestedFiles = filesArray.map((fileObj: any) => ({
        // Audio file properties
        id: fileObj.audio_file_id,
        type: "file",
        audioType: fileObj.audio_type,
        name: fileObj.name,
        fileUrl: fileObj.file_url,
        filePath: fileObj.file_path,
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
    let fileDuration = (file.duration || 0) + (file.delay || 0) / 1000;
    MacroDuration = Math.max(MacroDuration, fileDuration);
  }

  return {
    id: dbMacro.macro_id,
    type: "macro",
    audioType: "sfx", 
    name: dbMacro.name,
    description: dbMacro.description,
    volume: dbMacro.volume,
    duration: MacroDuration, 
    position: dbMacro.position,
    itemCount: dbMacro.item_count, 
    items: nestedFiles, 
    addedAt: dbMacro.created_at
  };
}

export function transformCollection(dbCollection: any){
  return {
    id: dbCollection.collection_id,
    type: dbCollection.type, 
    name: dbCollection.name,
    description: dbCollection.description,
    itemCount: dbCollection.item_count, 
    position: dbCollection.position,  
    items: null as any,
  };
}

export function transformFolder(dbFolder: any) {
  return {
    id: dbFolder.folder_id,
    name: dbFolder.name,
    type: dbFolder.folder_type,
    parentId: dbFolder.parent_folder_id
  };
}