-- Longer text from the full 5etools import:
-- - hp_formula: summoned creatures (spirits, companions, steeds) state their hit points as rules
--   text of up to ~120 characters. VARCHAR(64) -> VARCHAR(255).
-- - sense: a few senses carry a note ("darkvision 60 ft. (can see invisible creatures out to the
--   same range)"). VARCHAR(64) -> VARCHAR(128).
ALTER TABLE dnd5e.entities
  MODIFY hp_formula VARCHAR(255) NULL;
ALTER TABLE dnd5e.entity_senses
  MODIFY sense VARCHAR(128) NOT NULL;
