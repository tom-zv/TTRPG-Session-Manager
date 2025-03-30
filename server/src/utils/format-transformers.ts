// Function to transform DB audio item to API response format
export function transformAudioFile(dbAudioFile: any) {
  return {
    id: dbAudioFile.audio_file_id,  // DB ID
    type: "file", 
    audioType: dbAudioFile.audio_type,   // audio type: music, sfx, ambience
    name: dbAudioFile.name, 
    duration: dbAudioFile.duration,
    position: dbAudioFile.position,    // Position in collection
    fileUrl: dbAudioFile.file_url,     // Remote URL for playback
    filePath: dbAudioFile.file_path,   // Local path for file access
    folderId: dbAudioFile.folder_id,   
    volume: dbAudioFile.volume,
    delay: dbAudioFile.delay,
    addedAt: dbAudioFile.added_at,
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
      
      // Transform each nested file
      nestedFiles = filesArray.map((fileObj: any) => ({
        id: fileObj.audio_file_id,
        type: "file",
        audioType: fileObj.audio_type,
        name: fileObj.name,
        fileUrl: fileObj.file_url,
        filePath: fileObj.file_path,
        folderId: fileObj.folder_id,
        duration: fileObj.duration,
        volume: fileObj.volume,
        delay: fileObj.delay,
      }));
    } catch (error) {
      console.error("Error parsing macro files:", error);
      nestedFiles = [];
    }
  }
  
  let MacroDuration = 0;
  for (const f in nestedFiles) {
    let fileDuration = nestedFiles[f].duration + nestedFiles[f].delay / 1000;

    MacroDuration = Math.max(MacroDuration, fileDuration);
  }

  return {
    id: dbMacro.macro_id,
    type: "macro",
    audioType: "sfx", // Macros are always SFX type
    name: dbMacro.name,
    description: dbMacro.description,
    duration: MacroDuration, // Duration is the longest of the nested files including delay
    position: dbMacro.position,
    files: nestedFiles, // Include the nested files for playback
    addedAt: dbMacro.created_at
  };
}

export function transformCollection(dbCollection: any){
  return {
    id: dbCollection.collection_id,
    type: dbCollection.type, // Collection type: playlist, ambience, sfx, pack
    name: dbCollection.name,
    description: dbCollection.description,
    itemCount: dbCollection.item_count, 
    position: dbCollection.position,  // Position in a pack
  };
}

export function transformfolder(dbFolder: any) {
  return {
    id: dbFolder.folder_id,
    name: dbFolder.name,
    type: dbFolder.folder_type,
    parentId: dbFolder.parent_folder_id
  };
}