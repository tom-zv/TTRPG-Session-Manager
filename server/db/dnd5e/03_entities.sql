-- Extend core entities table with DnD specific properties
CREATE TABLE
    IF NOT EXISTS dnd5e.entities (
        id INT PRIMARY KEY REFERENCES core.entities (id) ON DELETE CASCADE,
        entity_type ENUM ('pc', 'npc', 'creature') NOT NULL DEFAULT 'creature',
        challenge_rating INT,
        armor_class INT NOT NULL DEFAULT 10,
        initiative_modifier INT DEFAULT 0,
        speed INT NOT NULL DEFAULT 30,
        max_hp INT NOT NULL DEFAULT 0,
        current_hp INT NOT NULL DEFAULT 0,
        ability_scores JSON NOT NULL DEFAULT '{
            "strength": 10,
            "dexterity": 10,
            "constitution": 10,
            "intelligence": 10,
            "wisdom": 10,
            "charisma": 10
        }',
        legendary_resistances JSON -- {"desc":"text","uses":2}
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.entity_resistances (
        entity_id INT NOT NULL,
        damage_type VARCHAR(64) NOT NULL,
        PRIMARY KEY (entity_id, damage_type),
        CONSTRAINT fk_entity_resist_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE,
        CONSTRAINT fk_entity_resist_damage_type FOREIGN KEY (damage_type) REFERENCES dnd5e.damage_types (name) ON DELETE CASCADE
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.entity_immunities (
        entity_id INT NOT NULL,
        damage_type VARCHAR(64) NOT NULL,
        PRIMARY KEY (entity_id, damage_type),
        CONSTRAINT fk_entity_immune_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE,
        CONSTRAINT fk_entity_immune_damage_type FOREIGN KEY (damage_type) REFERENCES dnd5e.damage_types (name) ON DELETE CASCADE
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.entity_vulnerabilities (
        entity_id INT NOT NULL,
        damage_type VARCHAR(64) NOT NULL,
        PRIMARY KEY (entity_id, damage_type),
        CONSTRAINT fk_entity_vuln_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE,
        CONSTRAINT fk_entity_vuln_damage_type FOREIGN KEY (damage_type) REFERENCES dnd5e.damage_types (name) ON DELETE CASCADE
    );