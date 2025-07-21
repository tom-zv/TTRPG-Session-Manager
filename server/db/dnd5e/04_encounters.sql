CREATE TABLE
  IF NOT EXISTS dnd5e.encounter_entities (
    encounter_id INT NOT NULL,
    entity_id INT NOT NULL,
    initiative_roll INT NULL,
    initiative_order INT NULL,
    current_hp INT NULL,
    temp_hp INT NULL DEFAULT 0,
    is_concentrating BOOLEAN DEFAULT FALSE,
    death_save_successes TINYINT DEFAULT 0,
    death_save_failures TINYINT DEFAULT 0,
    reaction_used BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (encounter_id, entity_id),
    CONSTRAINT fk_dnd5e_encounter_entities FOREIGN KEY (encounter_id, entity_id) 
      REFERENCES core.encounter_entities (encounter_id, entity_id) ON DELETE CASCADE
  );
