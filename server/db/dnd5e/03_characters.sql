-- Extend core characters table with DnD specific properties
CREATE TABLE
    IF NOT EXISTS dnd5e.characters (
        id INT PRIMARY KEY REFERENCES core.characters (id) ON DELETE CASCADE,
        character_type ENUM ('pc', 'npc', 'creature') NOT NULL DEFAULT 'creature',
        challenge_rating INT,
        armor_class INT,
        initiative_modifier INT DEFAULT 0,
        speed INT,
        max_hp INT NOT NULL DEFAULT 0,
        current_hp INT NOT NULL DEFAULT 0,
        ability_scores JSON, -- {"strength": int, "dexterity":, "constitution":, "intelligence":, "wisdow":, "charisma":}
        legendary_resistances JSON -- {"desc":"text","uses":2}
        -- …any other D&D-specific columns
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.character_vulnerabilities (
        character_id INT NOT NULL,
        damage_type_id INT NOT NULL,
        PRIMARY KEY (character_id, damage_type_id),
        CONSTRAINT fk_char_vuln_character FOREIGN KEY (character_id) REFERENCES dnd5e.characters (id) ON DELETE CASCADE,
        CONSTRAINT fk_char_vuln_damage_type FOREIGN KEY (damage_type_id) REFERENCES dnd5e.damage_types (id) ON DELETE CASCADE
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.character_resistances (
        character_id INT NOT NULL,
        damage_type_id INT NOT NULL,
        PRIMARY KEY (character_id, damage_type_id),
        CONSTRAINT fk_char_resist_character FOREIGN KEY (character_id) REFERENCES dnd5e.characters (id) ON DELETE CASCADE,
        CONSTRAINT fk_char_resist_damage_type FOREIGN KEY (damage_type_id) REFERENCES dnd5e.damage_types (id) ON DELETE CASCADE
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.character_immunities (
        character_id INT NOT NULL,
        damage_type_id INT NOT NULL,
        PRIMARY KEY (character_id, damage_type_id),
        CONSTRAINT fk_char_immune_character FOREIGN KEY (character_id) REFERENCES dnd5e.characters (id) ON DELETE CASCADE,
        CONSTRAINT fk_char_immune_damage_type FOREIGN KEY (damage_type_id) REFERENCES dnd5e.damage_types (id) ON DELETE CASCADE
    );