// Function to transform DB audio file to API response format
export function transformAudioFile(dbAudioFile: any) {
  return {
    id: dbAudioFile.audio_file_id,
    title: dbAudioFile.title,
    audioType: dbAudioFile.audio_type,
    duration: dbAudioFile.duration,
    position: dbAudioFile.position,
    fileUrl: dbAudioFile.file_url,
    filePath: dbAudioFile.file_path,
    folderId: dbAudioFile.folder_id,
    addedAt: dbAudioFile.added_at
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