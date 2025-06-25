CREATE TABLE
  IF NOT EXISTS audio.files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    audio_type ENUM ('music', 'sfx', 'ambience', 'any') NOT NULL DEFAULT 'any',
    duration INT,
    url VARCHAR(256),
    rel_path VARCHAR(256), -- Path relative to root folder of the audio library
    folder_id INT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_files_folder_id FOREIGN KEY (folder_id) REFERENCES audio.folders (id) ON DELETE SET DEFAULT
  );