-- Run once against an existing installation. Fresh installations get this column from
-- server/db/dnd5e/02_entities.sql. Additive only: one nullable column; existing rows read as an empty inventory.

ALTER TABLE dnd5e.entities
    ADD COLUMN inventory JSON NULL AFTER legendary_header;
