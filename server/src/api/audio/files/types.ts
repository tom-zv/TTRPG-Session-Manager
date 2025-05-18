export type AudioFileDB = {
    audio_file_id: number;
    name: string;
    audio_type: "music" | "sfx" | "ambience";
    folder_id: number;
    duration?: number;
    file_url?: string;
    file_path?: string;
    added_at?: string;
  };