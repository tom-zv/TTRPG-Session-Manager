-- Extend core entities table with DnD specific properties
CREATE TABLE
    IF NOT EXISTS dnd5e.entities (
        id INT PRIMARY KEY,
        role ENUM ('pc', 'npc', 'creature') NOT NULL DEFAULT 'creature',
        settings JSON NULL,
        creature_type VARCHAR(64) NULL,              -- 'beast', 'humanoid', 'fiend', etc.
        type_tags JSON NULL,                         -- type.tags or swarmSize: ["elf"], ["shapechanger"]
        cr VARCHAR(8),
        ac INT NOT NULL DEFAULT 10,
        hp INT NOT NULL DEFAULT 1,
        current_hp INT NULL,                         -- player characters: HP carried over from the last finished combat; NULL means full
        hp_formula VARCHAR(255) NULL,                -- e.g. '6d10 + 12', or a summon's rules text ('5 + five times your Ranger level ...')
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
        inventory JSON NULL,                         -- ordered [{name, quantity, notes?, itemId?}] for PCs and featured NPCs; NULL = empty. Only the inventory API reads or writes it
        inventory_revision INT UNSIGNED NULL,        -- bumped by every inventory write, for stale-save detection; NULL reads as 0. Only the inventory API reads or writes it
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
        sense VARCHAR(128) NOT NULL, -- e.g., darkvision 60ft, blindsight 10ft...
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
        display_as VARCHAR(32) DEFAULT NULL,         -- 'trait','action','bonus action','reaction','legendary'; NULL = own Spellcasting section
        ability CHAR(3) NULL,                        -- spellcasting ability: 'int', 'wis', 'cha'
        save_dc TINYINT NULL,
        spell_attack_bonus TINYINT NULL,
        hide_spell_list TINYINT(1) NOT NULL DEFAULT 0, -- descriptions already name the spells (5etools 'hidden')
        sort_order SMALLINT NOT NULL DEFAULT 0,
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
    lower_level TINYINT NULL,  -- pact magic: slots cover lower_level..spell_level
    PRIMARY KEY (spellcasting_id, spell_level),
    CONSTRAINT fk_spell_slots_spellcasting FOREIGN KEY (spellcasting_id) REFERENCES dnd5e.entity_spellcasting (id) ON DELETE CASCADE
);

-- Spell entries for both slot-based (spell_level) and usage-based (usage_freq) casting
CREATE TABLE IF NOT EXISTS dnd5e.entity_spells (
    id INT AUTO_INCREMENT PRIMARY KEY,
    spellcasting_id INT NOT NULL,
    spell_name VARCHAR(64) NOT NULL,  -- matches dnd5e.spells by name + source (no FK: either side may be imported first)
    spell_source VARCHAR(16) NULL,    -- source book, e.g. 'XPHB'
    note VARCHAR(512) NULL,           -- e.g. 'level 5 version', 'self only'
    spell_level INT,
    -- For usage-based casting
    usage_freq VARCHAR(32),  -- 'will', 'daily', 'restLong', 'recharge', 'legendary', etc. NULL for slot-based
    usage_detail VARCHAR(32),  -- count plus optional 'e' (each): '1e', '2'; recharge minimum or legendary cost; NULL for 'will'
    sort_order SMALLINT NOT NULL DEFAULT 0,
    INDEX idx_entity_spells_spellcasting (spellcasting_id),
    CONSTRAINT fk_entity_spells_spellcasting FOREIGN KEY (spellcasting_id) REFERENCES dnd5e.entity_spellcasting (id) ON DELETE CASCADE
);
