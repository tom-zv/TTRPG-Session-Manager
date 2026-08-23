-- Import identity and provenance for entities, as on dnd5e.items:
-- - import_key: immutable 'name|source', ASCII-lowercased set by the first 5etools import; NULL for
--   homebrew. The importer matches on it, so renaming an imported entity never breaks matching.
-- - source, page, imported_at: where the imported row came from and when it was last written.
-- - locally_edited: an imported row saved in the app; re-imports skip it unless --force.
-- Existing imported rows are backfilled from their entity_tags 'source' and 'page' rows. The tags
-- themselves are kept.
--
-- Before any change, the keys are checked in a temporary table. If two entities would get the same
-- import_key, or one entity has two source tags, the SELECT below lists them and the INSERT stops
-- the script with a duplicate-key error. Nothing has been altered at that point: resolve the
-- listed rows by hand (rename or retag them), then run this file again.
SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS dnd5e.entity_import_key_backfill;
DROP TEMPORARY TABLE IF EXISTS dnd5e.entity_import_key_candidates;

-- Every (entity, source tag) pair with its key, computed once. The key lowercases only the ASCII
-- letters A-Z, by byte-wise REPLACE under utf8mb4_bin, because that is what entityImportKey in
-- 5eToolsEntityImportRepository.ts does. MySQL LOWER() and JavaScript toLowerCase() disagree on
-- some Unicode letters (for example U+0130), so neither is used.
CREATE TEMPORARY TABLE dnd5e.entity_import_key_candidates (
  entity_id INT NOT NULL,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  source VARCHAR(32) NOT NULL,
  import_key VARCHAR(192) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  page SMALLINT UNSIGNED NULL
);

INSERT INTO dnd5e.entity_import_key_candidates (entity_id, name, source, import_key, page)
SELECT c.id, c.name, source_tag.tag,
       CONCAT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE((c.name COLLATE utf8mb4_bin), 'A', 'a'), 'B', 'b'), 'C', 'c'), 'D', 'd'), 'E', 'e'), 'F', 'f'), 'G', 'g'), 'H', 'h'), 'I', 'i'), 'J', 'j'), 'K', 'k'), 'L', 'l'), 'M', 'm'), 'N', 'n'), 'O', 'o'), 'P', 'p'), 'Q', 'q'), 'R', 'r'), 'S', 's'), 'T', 't'), 'U', 'u'), 'V', 'v'), 'W', 'w'), 'X', 'x'), 'Y', 'y'), 'Z', 'z'), '|', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE((source_tag.tag COLLATE utf8mb4_bin), 'A', 'a'), 'B', 'b'), 'C', 'c'), 'D', 'd'), 'E', 'e'), 'F', 'f'), 'G', 'g'), 'H', 'h'), 'I', 'i'), 'J', 'j'), 'K', 'k'), 'L', 'l'), 'M', 'm'), 'N', 'n'), 'O', 'o'), 'P', 'p'), 'Q', 'q'), 'R', 'r'), 'S', 's'), 'T', 't'), 'U', 'u'), 'V', 'v'), 'W', 'w'), 'X', 'x'), 'Y', 'y'), 'Z', 'z')),
       (SELECT MIN(CAST(page_tag.tag AS UNSIGNED))
        FROM dnd5e.entity_tags page_tag
        WHERE page_tag.entity_id = c.id
          AND page_tag.tag_type = 'page'
          AND page_tag.tag REGEXP '^[0-9]{1,5}$'
          AND CAST(page_tag.tag AS UNSIGNED) <= 65535)
FROM core.entities c
JOIN dnd5e.entities e ON e.id = c.id
JOIN dnd5e.entity_tags source_tag ON source_tag.entity_id = c.id AND source_tag.tag_type = 'source';

CREATE TEMPORARY TABLE dnd5e.entity_import_key_backfill (
  entity_id INT NOT NULL PRIMARY KEY,
  import_key VARCHAR(192) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  source VARCHAR(32) NOT NULL,
  page SMALLINT UNSIGNED NULL,
  UNIQUE KEY uq_entity_import_key_backfill (import_key)
);

-- Conflicts, if any. An empty result means the backfill can proceed.
SELECT entity_id, name, source, import_key
FROM (
  SELECT candidates.*,
         COUNT(*) OVER (PARTITION BY import_key) AS entities_with_key,
         COUNT(*) OVER (PARTITION BY entity_id) AS source_tags
  FROM dnd5e.entity_import_key_candidates candidates
) counted
WHERE entities_with_key > 1 OR source_tags > 1
ORDER BY import_key, entity_id;

INSERT INTO dnd5e.entity_import_key_backfill (entity_id, import_key, source, page)
SELECT entity_id, import_key, source, page FROM dnd5e.entity_import_key_candidates;

ALTER TABLE dnd5e.entities
  ADD COLUMN import_key VARCHAR(192) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL AFTER inventory_revision,
  ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'homebrew' AFTER import_key,
  ADD COLUMN page SMALLINT UNSIGNED NULL AFTER source,
  ADD COLUMN imported_at TIMESTAMP NULL AFTER page,
  ADD COLUMN locally_edited TINYINT(1) NOT NULL DEFAULT 0 AFTER imported_at,
  ADD UNIQUE KEY uq_dnd5e_entities_import_key (import_key);

UPDATE dnd5e.entities e
JOIN dnd5e.entity_import_key_backfill b ON b.entity_id = e.id
SET e.import_key = b.import_key, e.source = b.source, e.page = b.page;

DROP TEMPORARY TABLE dnd5e.entity_import_key_backfill;
DROP TEMPORARY TABLE dnd5e.entity_import_key_candidates;
