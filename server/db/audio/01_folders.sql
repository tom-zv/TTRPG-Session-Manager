CREATE TABLE
  IF NOT EXISTS audio.folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    parent_id INT,
    folder_type ENUM ('music', 'sfx', 'ambience', 'root', 'any') NOT NULL DEFAULT 'any',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_folders_parent_id FOREIGN KEY (parent_id) REFERENCES audio.folders (id) ON DELETE CASCADE
  );