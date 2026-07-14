-- Spells, imported from 5etools (source 'XPHB', ...) or made in the app (source 'homebrew').
-- Monsters reference spells by name + source (dnd5e.entity_spells.spell_name / spell_source and
-- inline {@spell Name|SRC} tags in text), not by id, so either side can be imported first.
CREATE TABLE IF NOT EXISTS dnd5e.spells (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'homebrew',
    page SMALLINT NULL,
    level TINYINT NOT NULL,                     -- 0 = cantrip
    school ENUM('abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation') NOT NULL,
    ritual TINYINT(1) NOT NULL DEFAULT 0,
    concentration TINYINT(1) NOT NULL DEFAULT 0,
    casting_time VARCHAR(64) NOT NULL,          -- display: '1 action', '1 bonus action', '10 minutes'
    casting_unit ENUM('action','bonus action','reaction','minute','hour') NOT NULL,  -- for filtering
    casting_trigger VARCHAR(512) NULL,          -- reactions and some bonus actions: 'which you take when...'
    range_text VARCHAR(64) NOT NULL,            -- 'Self', 'Touch', '150 feet', 'Self (15-foot cone)'
    range_feet INT NULL,                        -- for sorting; NULL for self, touch, sight, unlimited, special
    comp_v TINYINT(1) NOT NULL DEFAULT 0,
    comp_s TINYINT(1) NOT NULL DEFAULT 0,
    comp_m TINYINT(1) NOT NULL DEFAULT 0,
    material VARCHAR(512) NULL,
    material_cost_cp INT NULL,
    material_consumed TINYINT(1) NOT NULL DEFAULT 0,
    duration VARCHAR(64) NOT NULL,              -- 'Instantaneous', 'Concentration, up to 1 minute', 'Until dispelled'
    description TEXT NOT NULL,                  -- rich text: blank-line blocks, **Lead-in.**, '- ' lists, '| a | b |' tables, {@spell} tags
    higher_levels TEXT NULL,                    -- same format; heading depends on level (cantrip upgrade / higher-level slot)
    locally_edited TINYINT(1) NOT NULL DEFAULT 0,  -- edited in the app; the importer skips these rows unless --force
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_spells_name_source (name, source),
    INDEX idx_spells_level (level)
);

-- Filterable lists per spell: classes, damage types, saving throws, inflicted conditions, attack kind, aliases.
CREATE TABLE IF NOT EXISTS dnd5e.spell_tags (
    spell_id INT NOT NULL,
    tag_type ENUM('class','damage','save','condition','attack','alias') NOT NULL,
    tag VARCHAR(64) NOT NULL,
    PRIMARY KEY (spell_id, tag_type, tag),
    INDEX idx_spell_tags_tag (tag_type, tag),
    CONSTRAINT fk_spell_tags_spell FOREIGN KEY (spell_id) REFERENCES dnd5e.spells (id) ON DELETE CASCADE
);
