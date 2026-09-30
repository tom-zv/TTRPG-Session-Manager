CREATE TABLE
  IF NOT EXISTS core.encounters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    system_id INT NOT NULL,
    campaign_id INT NOT NULL,
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
    CONSTRAINT fk_encounters_system FOREIGN KEY (system_id) REFERENCES systems (id),
    CONSTRAINT fk_encounters_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE RESTRICT
  );

CREATE TABLE
  IF NOT EXISTS core.encounter_tags (
    encounter_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (encounter_id, tag_id),
    CONSTRAINT fk_encounter_tags_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
    CONSTRAINT fk_encounter_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
  );

-- Which entities an encounter uses and how many copies of each. Encounter state is a JSON document
-- that refers to entities by ID only; this table gives those references integrity (an entity in
-- use cannot be deleted) and lets lists show entity counts without reading the state.
-- The encounter engine rewrites an encounter's rows whenever its membership changes.
CREATE TABLE
  IF NOT EXISTS core.encounter_entities (
    encounter_id INT NOT NULL,
    entity_id INT NOT NULL,
    copies INT NOT NULL DEFAULT 1,
    PRIMARY KEY (encounter_id, entity_id),
    CONSTRAINT fk_encounter_entities_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
    CONSTRAINT fk_encounter_entities_entity FOREIGN KEY (entity_id) REFERENCES entities (id) ON DELETE RESTRICT
  );
