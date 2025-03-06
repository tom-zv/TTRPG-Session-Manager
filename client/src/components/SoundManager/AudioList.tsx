import React, { useState, useEffect } from 'react';
import { AudioFile } from 'shared/types/audio.js';
import { getAllAudioFiles } from '../../services/api.js';

const AudioList: React.FC = () => {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAudioFiles = async () => {
      try {
        setIsLoading(true);
        const files = await getAllAudioFiles();
        setAudioFiles(files);
        setError(null);
      } catch (err) {
        setError('Failed to fetch audio files. Please try again later.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAudioFiles();
  }, []);

  if (isLoading) {
    return <div className="loading">Loading audio files...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="audio-list">
      <h2>Audio Files</h2>
      {audioFiles.length === 0 ? (
        <p>No audio files found.</p>
      ) : (
        <ul>
          {audioFiles.map((file) => (
            <li key={file.audio_file_id} className="audio-item">
              <div className="audio-details">
                <h3>{file.title}</h3>
                <p>Type: {file.audio_type}</p>
                {file.file_path && <p>Path: {file.file_path}</p>}
                {file.file_url && <p>URL: {file.file_url}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AudioList;
