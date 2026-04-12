CREATE TABLE
  IF NOT EXISTS core.encounters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    system_id INT NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    status ENUM ('planned', 'active', 'completed') DEFAULT 'planned',
    location VARCHAR(128),
    difficulty VARCHAR(64),
    gm_notes JSON COMMENT 'Structure: [
      {
        "text": "string",       
        "timestamp": "string", 
      }
    ]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_encounters_system FOREIGN KEY (system_id) REFERENCES systems (id)
  );

CREATE TABLE
  IF NOT EXISTS core.encounter_tags (
    encounter_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (encounter_id, tag_id),
    CONSTRAINT fk_encounter_tags_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
    CONSTRAINT fk_encounter_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
  );
