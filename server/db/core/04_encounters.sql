CREATE TABLE
  IF NOT EXISTS core.encounters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    status ENUM ('planned', 'active', 'completed') DEFAULT 'planned',
    location VARCHAR(128),
    difficulty VARCHAR(64),
    round_count INT NOT NULL DEFAULT 0,
    dm_notes JSON COMMENT 'Structure: [
      {
        "text": "string",       
        "timestamp": "string", 
      }
    ]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS core.encounter_characters (
    encounter_id INT NOT NULL,
    character_id INT NOT NULL,
    is_hidden BOOLEAN DEFAULT FALSE,
    notes JSON,
    PRIMARY KEY (encounter_id, character_id),
    CONSTRAINT fk_encounter_characters_encounter_id FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
    CONSTRAINT fk_encounter_characters_character_id FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS core.encounter_tags (
    encounter_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (encounter_id, tag_id),
    CONSTRAINT fk_encounter_tags_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
    CONSTRAINT fk_encounter_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
  );
