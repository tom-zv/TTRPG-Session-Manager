-- Item catalog: imported 5etools items, base gear, groups, magic-variant families, the specifics
-- generated from them, and GM homebrew. Contracts in shared/domain/dnd5e/item.ts.
-- Inventories (dnd5e.entities.inventory) link rows here by id; a hidden or deleted item never
-- removes a row, so catalog rows are soft-deleted (deleted_at) and never hard-deleted by the app.
-- The CHECK clauses below record the connection charset of their string literals; pin it so a
-- fresh install and a migrated database store the same clause whatever client loads the file.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS dnd5e.items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Immutable import identity from shared itemImportKey(): 'named:dagger of venom|dmg',
    -- 'specific:+1 weapon|dmg>longsword|phb'. NULL for homebrew. Renames never change it.
    import_key VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    kind ENUM('concrete','family','group') NOT NULL,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'homebrew',
    page SMALLINT UNSIGNED NULL,
    -- Browser summary and filter fields
    category VARCHAR(32) NULL,                 -- app category, e.g. 'melee weapon'
    rarity ENUM('none','common','uncommon','rare','very rare','legendary','artifact','varies','unknown','unknown (magic)') NOT NULL DEFAULT 'none',
    requires_attunement TINYINT(1) NOT NULL DEFAULT 0,
    attunement_note VARCHAR(255) NULL,          -- 'by a wizard'; NULL for none or plain attunement
    value_cp DECIMAL(15,4) NULL,                -- price in copper pieces, exact
    weight_lb DECIMAL(12,4) NULL,               -- pounds, exact (0.075 for a sling bullet)
    -- Heterogeneous item attributes, validated as shared StoredItemDetails: description (rich text),
    -- weapon/armor fields, properties, charges, attached spells, preserved upstream JSON.
    details JSON NOT NULL,
    -- Generated specifics point at their variant family and the base printing they were made from.
    -- A concrete item may also name its base item. RESTRICT: the app soft-deletes, never hard-deletes.
    family_id INT NULL,
    base_item_id INT NULL,
    -- Import provenance
    import_revision VARCHAR(64) NULL,           -- upstream commit SHA (or input hash) of the last import that wrote the row
    imported_at TIMESTAMP NULL,
    -- Every import mode preserves GM visibility and deletion. Only a forced import may overwrite edits.
    locally_edited TINYINT(1) NOT NULL DEFAULT 0,  -- edited in the app; the importer skips these rows unless --force
    is_hidden TINYINT(1) NOT NULL DEFAULT 0,       -- hidden from players; a hidden family also hides its specifics
    deleted_at TIMESTAMP NULL,                     -- soft deletion; a re-import never resurrects the row
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_items_import_key (import_key),
    INDEX idx_items_name (name),
    INDEX idx_items_kind_name (kind, name),
    INDEX idx_items_source (source),
    INDEX idx_items_category (category),
    INDEX idx_items_rarity (rarity),
    CONSTRAINT fk_items_family FOREIGN KEY (family_id) REFERENCES dnd5e.items (id),
    CONSTRAINT fk_items_base_item FOREIGN KEY (base_item_id) REFERENCES dnd5e.items (id),
    CONSTRAINT chk_items_import_key CHECK (kind = 'concrete' OR import_key IS NOT NULL),
    CONSTRAINT chk_items_concrete_refs CHECK (
        (kind = 'concrete' OR base_item_id IS NULL)
        AND (family_id IS NULL OR (kind = 'concrete' AND base_item_id IS NOT NULL AND import_key IS NOT NULL))
    )
);

-- Searchable alternative names (5etools alias / previous names).
CREATE TABLE IF NOT EXISTS dnd5e.item_aliases (
    item_id INT NOT NULL,
    alias VARCHAR(255) NOT NULL,
    -- Written by the importer and API using the shared itemAliasKey function.
    alias_key VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
    PRIMARY KEY (item_id, alias_key),
    INDEX idx_item_aliases_alias (alias),
    CONSTRAINT fk_item_aliases_item FOREIGN KEY (item_id) REFERENCES dnd5e.items (id) ON DELETE CASCADE
);

-- Ordered relationships from one catalog item to others: the members of an item group, the
-- contents of an equipment pack. member_ref keeps the source-qualified reference as written
-- ('longsword|phb'); member_item_id is the resolved row, NULL while the reference is unresolved.
CREATE TABLE IF NOT EXISTS dnd5e.item_relations (
    item_id INT NOT NULL,
    relation ENUM('group_member','pack_content') NOT NULL,
    position SMALLINT UNSIGNED NOT NULL,        -- upstream order, from 0
    member_ref VARCHAR(512) NOT NULL,
    member_item_id INT NULL,
    quantity INT UNSIGNED NULL,                 -- pack contents only
    PRIMARY KEY (item_id, relation, position),
    INDEX idx_item_relations_member (member_item_id),
    CONSTRAINT fk_item_relations_item FOREIGN KEY (item_id) REFERENCES dnd5e.items (id) ON DELETE CASCADE,
    CONSTRAINT fk_item_relations_member FOREIGN KEY (member_item_id) REFERENCES dnd5e.items (id) ON DELETE SET NULL
);
