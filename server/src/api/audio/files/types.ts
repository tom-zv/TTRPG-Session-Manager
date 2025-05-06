export type AudioFileDB = {
    audio_file_id: number;
    name: string;
    audio_type: "music" | "sfx" | "ambience";
    duration?: number;
    playOrder: number;
    file_url?: string;
    file_path?: string;
    folder_id?: number;
    added_at?: string;
  };