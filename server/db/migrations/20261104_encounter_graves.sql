-- Run once against an existing installation before deploying server/client changes.
-- Fresh installations already include these columns in their CREATE TABLE scripts.
ALTER TABLE core.users ADD COLUMN preferences JSON NULL;
ALTER TABLE dnd5e.entities ADD COLUMN settings JSON NULL;
-- Encounter settings and inGrave are normalized inside existing JSON snapshots.
