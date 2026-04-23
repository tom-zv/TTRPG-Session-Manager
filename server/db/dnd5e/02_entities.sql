-- Extend core entities table with DnD specific properties
CREATE TABLE
    IF NOT EXISTS dnd5e.entities (
        id INT PRIMARY KEY,
        role ENUM ('pc', 'npc', 'creature') NOT NULL DEFAULT 'creature',
        creature_type VARCHAR(64) NULL,              -- 'beast', 'humanoid', 'fiend', etc.
        type_tags JSON NULL,                         -- type.tags or swarmSize: ["elf"], ["shapechanger"]
        cr VARCHAR(8),
        ac INT NOT NULL DEFAULT 10,
        hp INT NOT NULL DEFAULT 1,
        hp_formula VARCHAR(64) NULL,                 -- e.g. '6d10 + 12' or 'special: equal to warlock HP'
        speeds JSON,                                 -- {type: INT} e.g. {walk: 30, fly: 60}
        size ENUM ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan') NOT NULL DEFAULT 'medium',
        alignment VARCHAR(64) NOT NULL DEFAULT 'unaligned',
        ability_scores JSON NOT NULL,                -- {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10}
        saves JSON,                                  -- {"str": "+6", "con": "+4"}
        skills JSON,                                 -- {"perception": "+3", "stealth": "+5"}
        passive_perception SMALLINT NULL,
        languages JSON NULL,                         -- ["Common", "Elvish", "telepathy 120 ft."]
        legendary_action_count TINYINT NOT NULL DEFAULT 0,
        legendary_header JSON NULL,                  -- intro text lines for legendary actions section
        CONSTRAINT fk_dnd5e_entities_core_entity FOREIGN KEY (id) REFERENCES core.entities (id) ON DELETE CASCADE
    );
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_traits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        name VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        sort_order SMALLINT NOT NULL DEFAULT 0,
        CONSTRAINT fk_entity_trait_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE
    );
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_actions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        name VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        action_type VARCHAR(64) NOT NULL DEFAULT 'action', -- 'action','bonus action','reaction','legendary','mythic','villain','lair'
        sort_order SMALLINT NOT NULL DEFAULT 0,
        CONSTRAINT fk_entity_action_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE
    );
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_senses (
        entity_id INT NOT NULL,
        sense VARCHAR(64) NOT NULL, -- e.g., darkvision 60ft, blindsight 10ft...
        PRIMARY KEY (entity_id, sense),
        CONSTRAINT fk_entity_senses_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE
    );
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_resistances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        damage_type VARCHAR(64) NOT NULL,
        condition_note VARCHAR(256) NULL,            -- e.g. 'from nonmagical weapons that aren't silvered'
        INDEX idx_entity_resistances_entity (entity_id),
        CONSTRAINT fk_entity_resist_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE,
        CONSTRAINT fk_entity_resist_damage_type FOREIGN KEY (damage_type) REFERENCES dnd5e.damage_types (name) ON DELETE CASCADE
    );
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_immunities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        damage_type VARCHAR(64) NOT NULL,
        condition_note VARCHAR(256) NULL,
        INDEX idx_entity_immunities_entity (entity_id),
        CONSTRAINT fk_entity_immune_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE,
        CONSTRAINT fk_entity_immune_damage_type FOREIGN KEY (damage_type) REFERENCES dnd5e.damage_types (name) ON DELETE CASCADE
    );
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_vulnerabilities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        damage_type VARCHAR(64) NOT NULL,
        condition_note VARCHAR(256) NULL,
        INDEX idx_entity_vulnerabilities_entity (entity_id),
        CONSTRAINT fk_entity_vuln_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE,
        CONSTRAINT fk_entity_vuln_damage_type FOREIGN KEY (damage_type) REFERENCES dnd5e.damage_types (name) ON DELETE CASCADE
    );
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_condition_immunities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        condition_name VARCHAR(64) NOT NULL,
        condition_note VARCHAR(256) NULL,            -- e.g. 'unless the creature is below half HP'
        INDEX idx_entity_condition_immunities_entity (entity_id),
        CONSTRAINT fk_entity_condition_immune_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE
    );
CREATE TABLE 
    IF NOT EXISTS dnd5e.entity_tags (
        entity_id INT,
        tag_type VARCHAR(16),  -- 'environment','group','damage',...
        tag VARCHAR(32),
        PRIMARY KEY(entity_id,tag_type,tag)
    );
-- Main spellcasting table
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_spellcasting (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        name VARCHAR(64) NOT NULL DEFAULT 'Spellcasting',
        display_as VARCHAR(32) DEFAULT NULL,         -- 'action', NULL, etc.
        ability CHAR(3) NULL,                        -- spellcasting ability: 'int', 'wis', 'cha'
        save_dc TINYINT NULL,
        spell_attack_bonus TINYINT NULL,
        CONSTRAINT fk_entity_spellcasting_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS dnd5e.entity_spellcasting_descriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    spellcasting_id INT NOT NULL,
    description_order INT NOT NULL, 
    description TEXT NOT NULL,
    CONSTRAINT fk_spellcasting_desc FOREIGN KEY (spellcasting_id) REFERENCES dnd5e.entity_spellcasting (id) ON DELETE CASCADE
);

-- Storing spell slots per level
CREATE TABLE IF NOT EXISTS dnd5e.entity_spell_slots (
    spellcasting_id INT NOT NULL,
    spell_level INT NOT NULL,  -- 0 for cantrips
    slots INT,  -- NULL for cantrips
    PRIMARY KEY (spellcasting_id, spell_level),
    CONSTRAINT fk_spell_slots_spellcasting FOREIGN KEY (spellcasting_id) REFERENCES dnd5e.entity_spellcasting (id) ON DELETE CASCADE
);

-- Modified table for all spell entries, supporting both formats
CREATE TABLE IF NOT EXISTS dnd5e.entity_spells (
    id INT AUTO_INCREMENT PRIMARY KEY,
    spellcasting_id INT NOT NULL,
    spell_name VARCHAR(64) NOT NULL,  -- TODO reference spells table when implemented
    spell_level INT,
    -- For usage-based casting
    usage_freq VARCHAR(32),  -- 'will', 'daily', etc. NULL for slot-based
    usage_detail VARCHAR(32),  -- '1e' (1-each), '2', NULL for slot-based or 'will'
    
    UNIQUE(spellcasting_id, spell_name, spell_level, usage_freq, usage_detail),
    CONSTRAINT fk_entity_spells_spellcasting FOREIGN KEY (spellcasting_id) REFERENCES dnd5e.entity_spellcasting (id) ON DELETE CASCADE
);