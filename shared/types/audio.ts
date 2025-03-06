export interface AudioFile {
  audio_file_id: number;
  title: string;
  audio_type: string;
  file_url?: string;
  file_path?: string;
  folder_id?: number;
  added_at?: string;
}
