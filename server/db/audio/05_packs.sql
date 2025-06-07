CREATE TABLE
  IF NOT EXISTS audio.audio_packs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS audio.audio_pack_collections (
    pack_id INT NOT NULL,
    collection_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_collections PRIMARY KEY (pack_id, collection_id),
    CONSTRAINT fk_audio_pack_collections_pack_id FOREIGN KEY (pack_id) REFERENCES audio.audio_packs (id) ON DELETE CASCADE,
    CONSTRAINT fk_audio_pack_collections_collection_id FOREIGN KEY (collection_id) REFERENCES audio.collections (id) ON DELETE CASCADE
  );
