CREATE TABLE
  IF NOT EXISTS dnd5e.encounter_characters (
    encounter_id INT NOT NULL,
    character_id INT NOT NULL,
    initiative_roll INT NULL,
    initiative_order INT NULL,
    current_hp INT NULL,
    temp_hp INT NULL DEFAULT 0,
    is_concentrating BOOLEAN DEFAULT FALSE,
    death_save_successes TINYINT DEFAULT 0,
    death_save_failures TINYINT DEFAULT 0,
    reaction_used BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (encounter_id, character_id),
    CONSTRAINT fk_dnd5e_encounter_characters FOREIGN KEY (encounter_id, character_id) 
      REFERENCES core.encounter_characters (encounter_id, character_id) ON DELETE CASCADE
  );
