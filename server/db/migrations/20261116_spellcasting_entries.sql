-- Run once against an existing installation before deploying server/client changes.
-- Fresh installations already include these columns in their CREATE TABLE scripts.
-- Afterwards, re-import 5etools bestiaries in upsert mode to fill notes, sources,
-- hidden spell lists and the recharge / legendary / long rest groups the old importer dropped.

ALTER TABLE dnd5e.entity_spellcasting
    ADD COLUMN hide_spell_list TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN sort_order SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE dnd5e.entity_spell_slots
    ADD COLUMN lower_level TINYINT NULL;

-- The UNIQUE key never held (NULL columns) and would reject one spell listed twice with different notes.
-- Add the plain index first so the foreign key on spellcasting_id keeps an index when the UNIQUE key is dropped.
ALTER TABLE dnd5e.entity_spells
    ADD COLUMN spell_source VARCHAR(16) NULL AFTER spell_name,
    ADD COLUMN note VARCHAR(512) NULL AFTER spell_source,
    ADD COLUMN sort_order SMALLINT NOT NULL DEFAULT 0,
    ADD INDEX idx_entity_spells_spellcasting (spellcasting_id);

ALTER TABLE dnd5e.entity_spells DROP INDEX spellcasting_id;

-- Existing rows keep sort_order 0; reads order by (sort_order, id), so they stay in insertion order.

-- One displayAs vocabulary: importer wrote 'bonus', the form wrote 'spellcasting' for the default section.
UPDATE dnd5e.entity_spellcasting SET display_as = 'bonus action' WHERE display_as = 'bonus';
UPDATE dnd5e.entity_spellcasting SET display_as = NULL WHERE display_as = 'spellcasting';
