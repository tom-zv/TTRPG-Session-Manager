-- Extend core entities table with DnD specific properties
CREATE TABLE
    IF NOT EXISTS dnd5e.entities (
        id INT PRIMARY KEY REFERENCES core.entities (id) ON DELETE CASCADE,
        entity_type ENUM ('pc', 'npc', 'creature') NOT NULL DEFAULT 'creature',
        cr VARCHAR(8),
        ac INT NOT NULL DEFAULT 10,
        hp INT NOT NULL DEFAULT 1,
        speeds JSON, -- {'type': INT,}
        size ENUM ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan') NOT NULL DEFAULT 'medium',
        allignment VARCHAR(64) NOT NULL DEFAULT 'unaligned',
        ability_scores JSON NOT NULL DEFAULT '{
            "str": 10,
            "dex": 10,
            "con": 10,
            "int": 10,
            "wis": 10,
            "cha": 10
        }',
        saves JSON -- {'str': '+INT', 'dex': "-INT",...}
        skills JSON -- {'acrobatics': '+INT', 'arcana': "-INT",...}
    );


CREATE TABLE
    IF NOT EXISTS dnd5e.entity_traits (
        id SERIAL PRIMARY KEY,
        entity_id INT NOT NULL,
        name VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        CONSTRAINT fk_entity_trait_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE
    );

CREATE TABLE
    IF NOT EXISTS dnd5e.entity_actions (
        id SERIAL PRIMARY KEY,
        entity_id INT NOT NULL,
        name VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        action_type VARCHAR(64) NOT NULL DEFAULT 'action', -- action, bonus action, reaction, etc.
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

CREATE TABLE
    IF NOT EXISTS dnd5e.entity_condition_immunities (
        entity_id INT NOT NULL,
        condition_id INT NOT NULL,
        PRIMARY KEY (entity_id, condition_id),
        CONSTRAINT fk_entity_condition_immune_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE,
        CONSTRAINT fk_entity_condition_immune_condition FOREIGN KEY (condition_id) REFERENCES dnd5e.conditions (id) ON DELETE CASCADE
    )

CREATE TABLE 
    IF NOT EXISTS dnd5e.entity_tags (
        entity_id INT,
        tag_type VARCHAR(16),  -- 'environment','group','damage',...
        tag VARCHAR(32),
        PRIMARY KEY(entity_id,tag_type,tag)
    );

-- Main spellcasting table - needs name and type fields
CREATE TABLE
    IF NOT EXISTS dnd5e.entity_spellcasting (
        id SERIAL PRIMARY KEY,
        entity_id INT NOT NULL,
        name VARCHAR(64) NOT NULL DEFAULT 'Spellcasting',
        display_as VARCHAR(32) DEFAULT NULL, -- 'action', NULL, etc.
        CONSTRAINT fk_entity_spellcasting_entity FOREIGN KEY (entity_id) REFERENCES dnd5e.entities (id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS dnd5e.entity_spellcasting_descriptions (
    id SERIAL PRIMARY KEY,
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
    id SERIAL PRIMARY KEY,
    spellcasting_id INT NOT NULL,
    spell_name VARCHAR(64) NOT NULL,  -- TODO reference spells table when implemented
    spell_level INT,
    -- For usage-based casting
    usage_freq VARCHAR(32),  -- 'will', 'daily', etc. NULL for slot-based
    usage_detail VARCHAR(32),  -- '1e' (1-each), '2', NULL for slot-based or 'will'
    
    UNIQUE(spellcasting_id, spell_name, spell_level, usage_type, usage_detail),
    CONSTRAINT fk_entity_spells_spellcasting FOREIGN KEY (spellcasting_id) REFERENCES dnd5e.entity_spellcasting (id) ON DELETE CASCADE
);