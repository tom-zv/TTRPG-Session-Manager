CREATE TABLE
    IF NOT EXISTS dnd5e.conditions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        description TEXT
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.character_conditions (
        encounter_id INT NOT NULL,
        character_id INT NOT NULL,
        condition_id INT NOT NULL,
        duration INT,
        started_on_round INT,
        PRIMARY KEY (encounter_id, character_id, condition_id),
        CONSTRAINT fk_character_conditions_encounter_character FOREIGN KEY (encounter_id, character_id) REFERENCES core.encounter_characters (encounter_id, character_id) ON DELETE CASCADE,
        CONSTRAINT fk_character_conditions_condition FOREIGN KEY (condition_id) REFERENCES conditions (id) ON DELETE CASCADE
    );