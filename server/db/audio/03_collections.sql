CREATE TABLE
  IF NOT EXISTS audio.collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    type ENUM ('playlist', 'sfx', 'ambience') NOT NULL,
    image_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS audio.collection_files (
    collection_id INT NOT NULL,
    file_id INT NOT NULL,
    active BOOLEAN DEFAULT FALSE,
    position INT NOT NULL,
    volume FLOAT DEFAULT 1,
    PRIMARY KEY (collection_id, file_id),
    CONSTRAINT fk_collection_files_collection_id FOREIGN KEY (collection_id) REFERENCES audio.collections (id) ON DELETE CASCADE,
    CONSTRAINT fk_collection_files_file_id FOREIGN KEY (file_id) REFERENCES audio.files (id) ON DELETE CASCADE
  );
