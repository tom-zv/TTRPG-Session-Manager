// Function to transform DB audio item to API response format
export function transformAudioItem(dbAudioItem: any) {
  return {
    id: dbAudioItem.audio_file_id,
    collection_id: dbAudioItem.collection_id,
    name: dbAudioItem.name,
    type: dbAudioItem.type,
    audioType: dbAudioItem.audio_type,
    duration: dbAudioItem.duration,
    position: dbAudioItem.position,
    fileUrl: dbAudioItem.file_url,
    filePath: dbAudioItem.file_path,
    folderId: dbAudioItem.folder_id,
    addedAt: dbAudioItem.added_at,
    volume: dbAudioItem.volume,
    itemCount: dbAudioItem.item_count,
    description: dbAudioItem.description,
  };
}


export function transformCollection(dbCollection: any){
  return {
    id: dbCollection.collection_id,
    name: dbCollection.name,
    type: dbCollection.collection_type,
    description: dbCollection.description,
    itemCount: dbCollection.item_count,
    position: dbCollection.position,
  };
}

export function transformMacro(dbMacro: any) {
  return {
    id: dbMacro.macro_id,
    type: 'macro',
    position: dbMacro.position,
    name: dbMacro.name,
    description: dbMacro.description
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