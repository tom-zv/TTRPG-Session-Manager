CREATE TABLE
  IF NOT EXISTS audio.sfx_macros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    volume FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS audio.macro_tags (
    macro_id INT NOT NULL,
    tag VARCHAR(64) NOT NULL,
    PRIMARY KEY (macro_id, tag),
    CONSTRAINT fk_macro_tags_macro_id FOREIGN KEY (macro_id) REFERENCES audio.sfx_macros (id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS audio.sfx_macro_files (
    macro_id INT NOT NULL,
    file_id INT NOT NULL,
    delay INT DEFAULT 0,
    volume FLOAT DEFAULT 1.0,
    CONSTRAINT pk_sfx_macro_files PRIMARY KEY (macro_id, file_id),
    CONSTRAINT fk_sfx_macro_files_macro_id FOREIGN KEY (macro_id) REFERENCES audio.sfx_macros (id) ON DELETE CASCADE,
    CONSTRAINT fk_sfx_macro_files_file_id FOREIGN KEY (file_id) REFERENCES audio.files (id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS audio.collection_sfx_macros (
    collection_id INT NOT NULL,
    macro_id INT NOT NULL,
    position INT NOT NULL,
    PRIMARY KEY (collection_id, macro_id),
    CONSTRAINT fk_collection_sfx_macros_collection_id FOREIGN KEY (collection_id) REFERENCES audio.collections (id) ON DELETE CASCADE,
    CONSTRAINT fk_collection_sfx_macros_macro_id FOREIGN KEY (macro_id) REFERENCES audio.sfx_macros (id) ON DELETE CASCADE
  );
