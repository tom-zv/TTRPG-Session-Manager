import { dnd5ePool } from "src/db.js";
import {
  DnD5eEntitySummaryDB,
  DnD5eEntityDB,
  DnD5eEntityWriteDB,
  DnD5eEntityUpdateDB,
  DamageModifierDB,
  ConditionImmunityDB,
  EntityTraitDB,
  EntityActionDB,
  EntitySpellcastingDB,
  SpellcastingLevelDB,
} from "./types.js";
import { RowDataPacket, PoolConnection, ExecuteValues, ResultSetHeader } from "mysql2/promise";
import {
  DnD5eEntityState,
  isSpellcastingDisplay,
  isSpellFrequency,
  type SpellEntry,
  type SpellFrequencyGroup,
} from "shared/domain/encounters/dnd5e/entity.js";
import type { EntitySettings } from "shared/domain/encounters/dnd5e/settings.js";
import { mergeSettings } from "shared/domain/encounters/settings.js";
import { readJsonNumberArrayColumn, readJsonObjectColumn } from "src/utils/jsonColumn.js";
import { NotFoundError } from "src/api/HttpErrors.js";

// Extract only the columns that live on the dnd5e.entities main row
function extractDnD5eTableFields(data: DnD5eEntityUpdateDB) {
  return {
    role: data.role,
    settings: data.settings,
    creature_type: data.creature_type,
    type_tags: data.type_tags,
    cr: data.cr,
    ac: data.ac,
    hp: data.hp,
    hp_formula: data.hp_formula,
    speeds: data.speeds,
    size: data.size,
    alignment: data.alignment,
    ability_scores: data.ability_scores,
    saves: data.saves,
    skills: data.skills,
    passive_perception: data.passive_perception,
    languages: data.languages,
    legendary_action_count: data.legendary_action_count,
    legendary_header: data.legendary_header,
  };
}

// ─── SELECT fragment shared by all read queries ───────────────────────────────
/** The users assigned to an entity, as a JSON array. Expects the core entity row aliased as `c`. */
const CONTROLLER_IDS_SELECT = "(SELECT JSON_ARRAYAGG(ue.user_id) FROM core.user_entities ue WHERE ue.entity_id = c.id)";

/** Read-only provenance columns. Expects the dnd5e entity row aliased as `e`. */
const PROVENANCE_SELECT = "e.source, e.page, e.import_key IS NOT NULL AS imported, e.locally_edited";

const ENTITY_SELECT = `
  SELECT
    c.id, c.name, c.image_url, c.created_at,
    e.role, e.settings, e.creature_type, e.type_tags, e.cr,
    e.ac, e.hp, e.hp_formula, e.speeds, e.size, e.alignment,
    e.ability_scores, e.saves, e.skills,
    e.passive_perception, e.languages,
    e.legendary_action_count, e.legendary_header,
    ${PROVENANCE_SELECT},
    ${CONTROLLER_IDS_SELECT} AS controller_user_ids
  FROM core.entities c
  JOIN dnd5e.entities e ON c.id = e.id`;

// ─── Join-table helpers ───────────────────────────────────────────────────────

async function fetchSenses(pool: PoolConnection | typeof dnd5ePool, entityId: number): Promise<string[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT sense FROM dnd5e.entity_senses WHERE entity_id = ? ORDER BY sense`,
    [entityId]
  );
  return rows.map(r => r.sense as string);
}

async function fetchConditionImmunities(pool: PoolConnection | typeof dnd5ePool, entityId: number): Promise<ConditionImmunityDB[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT condition_name, condition_note FROM dnd5e.entity_condition_immunities WHERE entity_id = ?`,
    [entityId]
  );
  return rows as ConditionImmunityDB[];
}

async function fetchDamageModifiers(
  pool: PoolConnection | typeof dnd5ePool,
  table: string,
  entityId: number
): Promise<DamageModifierDB[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT damage_type, condition_note FROM dnd5e.${table} WHERE entity_id = ?`,
    [entityId]
  );
  return rows as DamageModifierDB[];
}

async function fetchTraits(pool: PoolConnection | typeof dnd5ePool, entityId: number): Promise<EntityTraitDB[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT name, description, sort_order FROM dnd5e.entity_traits WHERE entity_id = ? ORDER BY sort_order`,
    [entityId]
  );
  return rows as EntityTraitDB[];
}

async function fetchActions(pool: PoolConnection | typeof dnd5ePool, entityId: number): Promise<EntityActionDB[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT name, description, action_type, sort_order FROM dnd5e.entity_actions WHERE entity_id = ? ORDER BY sort_order`,
    [entityId]
  );
  return rows as EntityActionDB[];
}

// Spellcasting for several entities in four queries, keyed by entity id; blocks and spells keep their stored order.
async function fetchSpellcastingForEntities(
  pool: PoolConnection | typeof dnd5ePool,
  entityIds: number[]
): Promise<Map<number, EntitySpellcastingDB[]>> {
  const result = new Map<number, EntitySpellcastingDB[]>();
  if (entityIds.length === 0) return result;

  const entityPlaceholders = entityIds.map(() => '?').join(',');
  const [scRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, entity_id, name, display_as, ability, save_dc, spell_attack_bonus, hide_spell_list
     FROM dnd5e.entity_spellcasting WHERE entity_id IN (${entityPlaceholders})
     ORDER BY entity_id, sort_order, id`,
    entityIds
  );
  if (scRows.length === 0) return result;

  const scIds = scRows.map(row => row.id as number);
  const scPlaceholders = scIds.map(() => '?').join(',');
  const [descRows] = await pool.execute<RowDataPacket[]>(
    `SELECT spellcasting_id, description FROM dnd5e.entity_spellcasting_descriptions
     WHERE spellcasting_id IN (${scPlaceholders}) ORDER BY spellcasting_id, description_order`,
    scIds
  );
  const [slotRows] = await pool.execute<RowDataPacket[]>(
    `SELECT spellcasting_id, spell_level, slots, lower_level FROM dnd5e.entity_spell_slots
     WHERE spellcasting_id IN (${scPlaceholders}) ORDER BY spellcasting_id, spell_level`,
    scIds
  );
  const [spellRows] = await pool.execute<RowDataPacket[]>(
    `SELECT spellcasting_id, spell_name, spell_source, note, spell_level, usage_freq, usage_detail
     FROM dnd5e.entity_spells WHERE spellcasting_id IN (${scPlaceholders})
     ORDER BY spellcasting_id, sort_order, id`,
    scIds
  );

  const blocks = new Map<number, {
    descriptions: string[];
    levels: Map<number, SpellcastingLevelDB>;
    groups: Map<string, SpellFrequencyGroup>;
  }>();
  for (const sc of scRows) blocks.set(sc.id as number, { descriptions: [], levels: new Map(), groups: new Map() });

  for (const row of descRows) blocks.get(row.spellcasting_id as number)?.descriptions.push(row.description as string);

  for (const row of slotRows) {
    blocks.get(row.spellcasting_id as number)?.levels.set(row.spell_level as number, {
      level: row.spell_level as number,
      slots: (row.slots as number | null) ?? undefined,
      lower_level: (row.lower_level as number | null) ?? undefined,
      spells: [],
    });
  }

  for (const row of spellRows) {
    const block = blocks.get(row.spellcasting_id as number);
    if (!block) continue;
    const spell: SpellEntry = {
      name: row.spell_name as string,
      ...(row.spell_source ? { source: row.spell_source as string } : {}),
      ...(row.note ? { note: row.note as string } : {}),
    };

    if (row.usage_freq && isSpellFrequency(row.usage_freq)) {
      const detail = (row.usage_detail as string | null) ?? '';
      const key = `${row.usage_freq}_${detail}`;
      if (!block.groups.has(key)) {
        block.groups.set(key, { frequency: row.usage_freq, ...parseUsageDetail(detail), spells: [] });
      }
      block.groups.get(key)!.spells.push(spell);
    } else if (row.spell_level != null) {
      block.levels.get(row.spell_level as number)?.spells.push(spell);
    }
  }

  for (const sc of scRows) {
    const entityId = sc.entity_id as number;
    const block = blocks.get(sc.id as number)!;
    const levels = Array.from(block.levels.values());
    const groups = Array.from(block.groups.values());
    if (!result.has(entityId)) result.set(entityId, []);
    result.get(entityId)!.push({
      name: sc.name as string,
      display_as: isSpellcastingDisplay(sc.display_as) ? sc.display_as : undefined,
      ability: (sc.ability as string | null) ?? undefined,
      save_dc: (sc.save_dc as number | null) ?? undefined,
      spell_attack_bonus: (sc.spell_attack_bonus as number | null) ?? undefined,
      descriptions: block.descriptions,
      hide_spell_list: Boolean(sc.hide_spell_list) || undefined,
      levels: levels.length > 0 ? levels : undefined,
      frequency_groups: groups.length > 0 ? groups : undefined,
    });
  }

  return result;
}

// usage_detail '2e' <-> { count: 2, each: true }
function parseUsageDetail(detail: string): Pick<SpellFrequencyGroup, 'count' | 'each'> {
  const match = detail.match(/^(\d+)(e?)$/);
  if (!match) return {};
  return { count: Number(match[1]), ...(match[2] ? { each: true } : {}) };
}

function formatUsageDetail(group: SpellFrequencyGroup): string | null {
  if (group.count == null) return null;
  return `${group.count}${group.each ? 'e' : ''}`;
}

// Attach all join-table data onto an entity object in place
async function hydrateEntity(
  pool: PoolConnection | typeof dnd5ePool,
  entity: DnD5eEntityDB
): Promise<void> {
  const id = entity.id;
  entity.senses              = await fetchSenses(pool, id);
  entity.condition_immunities = await fetchConditionImmunities(pool, id);
  entity.resistances         = await fetchDamageModifiers(pool, 'entity_resistances', id);
  entity.immunities          = await fetchDamageModifiers(pool, 'entity_immunities', id);
  entity.vulnerabilities     = await fetchDamageModifiers(pool, 'entity_vulnerabilities', id);
  entity.traits              = await fetchTraits(pool, id);
  entity.actions             = await fetchActions(pool, id);
  entity.spellcasting        = (await fetchSpellcastingForEntities(pool, [id])).get(id) ?? [];
}

// ─── Write helpers ────────────────────────────────────────────────────────────

async function upsertSenses(conn: PoolConnection, entityId: number, senses: string[] | undefined, isUpdate: boolean): Promise<void> {
  if (senses === undefined) return;
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_senses WHERE entity_id = ?`, [entityId]);
  for (const sense of senses) {
    await conn.execute(`INSERT INTO dnd5e.entity_senses (entity_id, sense) VALUES (?, ?)`, [entityId, sense]);
  }
}

async function upsertConditionImmunities(conn: PoolConnection, entityId: number, items: ConditionImmunityDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (items === undefined) return;
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_condition_immunities WHERE entity_id = ?`, [entityId]);
  for (const item of items) {
    await conn.execute(
      `INSERT INTO dnd5e.entity_condition_immunities (entity_id, condition_name, condition_note) VALUES (?, ?, ?)`,
      [entityId, item.condition_name, item.condition_note ?? null]
    );
  }
}

async function upsertDamageModifiers(conn: PoolConnection, entityId: number, table: string, items: DamageModifierDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (items === undefined) return;
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.${table} WHERE entity_id = ?`, [entityId]);
  for (const item of items) {
    await conn.execute(
      `INSERT INTO dnd5e.${table} (entity_id, damage_type, condition_note) VALUES (?, ?, ?)`,
      [entityId, item.damage_type, item.condition_note ?? null]
    );
  }
}

async function upsertTraits(conn: PoolConnection, entityId: number, traits: EntityTraitDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (traits === undefined) return;
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_traits WHERE entity_id = ?`, [entityId]);
  for (let i = 0; i < traits.length; i++) {
    const t = traits[i];
    await conn.execute(
      `INSERT INTO dnd5e.entity_traits (entity_id, name, description, sort_order) VALUES (?, ?, ?, ?)`,
      [entityId, t.name, t.description, t.sort_order ?? i]
    );
  }
}

async function upsertActions(conn: PoolConnection, entityId: number, actions: EntityActionDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (actions === undefined) return;
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_actions WHERE entity_id = ?`, [entityId]);
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    await conn.execute(
      `INSERT INTO dnd5e.entity_actions (entity_id, name, description, action_type, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [entityId, a.name, a.description, a.action_type, a.sort_order ?? i]
    );
  }
}

async function upsertSpellcasting(conn: PoolConnection, entityId: number, spellcasting: EntitySpellcastingDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (spellcasting === undefined) return;
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_spellcasting WHERE entity_id = ?`, [entityId]);

  for (let scIndex = 0; scIndex < spellcasting.length; scIndex++) {
    const sc = spellcasting[scIndex];
    const [result] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO dnd5e.entity_spellcasting
         (entity_id, name, display_as, ability, save_dc, spell_attack_bonus, hide_spell_list, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entityId, sc.name, sc.display_as ?? null, sc.ability ?? null, sc.save_dc ?? null,
        sc.spell_attack_bonus ?? null, sc.hide_spell_list ? 1 : 0, scIndex,
      ]
    );
    const scId = result.insertId;

    for (let i = 0; i < (sc.descriptions ?? []).length; i++) {
      await conn.execute(
        `INSERT INTO dnd5e.entity_spellcasting_descriptions (spellcasting_id, description_order, description) VALUES (?, ?, ?)`,
        [scId, i, sc.descriptions[i]]
      );
    }

    // One running sort_order per block keeps level spells and frequency groups in stored order.
    let spellOrder = 0;
    const insertSpell = (spell: SpellEntry, level: number | null, freq: string | null, detail: string | null) =>
      conn.execute(
        `INSERT INTO dnd5e.entity_spells
           (spellcasting_id, spell_name, spell_source, note, spell_level, usage_freq, usage_detail, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [scId, spell.name, spell.source ?? null, spell.note ?? null, level, freq, detail, spellOrder++]
      );

    for (const lvl of sc.levels ?? []) {
      await conn.execute(
        `INSERT INTO dnd5e.entity_spell_slots (spellcasting_id, spell_level, slots, lower_level) VALUES (?, ?, ?, ?)`,
        [scId, lvl.level, lvl.slots ?? null, lvl.lower_level ?? null]
      );
      for (const spell of lvl.spells ?? []) await insertSpell(spell, lvl.level, null, null);
    }

    for (const group of sc.frequency_groups ?? []) {
      const detail = formatUsageDetail(group);
      for (const spell of group.spells) await insertSpell(spell, null, group.frequency, detail);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function insertEntity(
  connection: PoolConnection,
  entityId: number,
  data: DnD5eEntityWriteDB
): Promise<void> {
  const tableData = extractDnD5eTableFields(data);
  const { fields, values } = prepareEntityFields(tableData, false);

  await connection.execute(
    `INSERT INTO dnd5e.entities (id, ${fields.join(", ")}) VALUES (?, ${values.map(() => '?').join(", ")})`,
    [entityId, ...values]
  );

  await upsertSenses(connection, entityId, data.senses, false);
  await upsertConditionImmunities(connection, entityId, data.condition_immunities, false);
  await upsertDamageModifiers(connection, entityId, 'entity_resistances', data.resistances, false);
  await upsertDamageModifiers(connection, entityId, 'entity_vulnerabilities', data.vulnerabilities, false);
  await upsertDamageModifiers(connection, entityId, 'entity_immunities', data.immunities, false);
  await upsertTraits(connection, entityId, data.traits, false);
  await upsertActions(connection, entityId, data.actions, false);
  await upsertSpellcasting(connection, entityId, data.spellcasting, false);
}

/**
 * Locks an entity for an app edit of its template: the core row first, then the D&D row, which is
 * the order a cascading DELETE of the core row uses, so an edit and a delete cannot deadlock. A row with an import identity may only be
 * edited when the GM confirmed overwriting it, which marks it locally edited so re-imports skip it.
 * The importer writes through updateEntity directly and never calls this.
 */
export async function claimTemplateEdit(
  connection: PoolConnection,
  entityId: number,
  overwriteImported: boolean
): Promise<"editable" | "imported"> {
  const [core] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM core.entities WHERE id = ? FOR UPDATE",
    [entityId]
  );
  if (core.length === 0) throw new NotFoundError(`Entity with id ${entityId} not found`);
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT import_key FROM dnd5e.entities WHERE id = ? FOR UPDATE",
    [entityId]
  );
  if (rows.length === 0) throw new NotFoundError(`Entity with id ${entityId} not found`);
  if (rows[0].import_key === null) return "editable";
  if (!overwriteImported) return "imported";

  await connection.execute("UPDATE dnd5e.entities SET locally_edited = 1 WHERE id = ?", [entityId]);
  return "editable";
}

export async function updateEntity(
  connection: PoolConnection,
  entityId: number,
  data: DnD5eEntityUpdateDB
): Promise<void> {
  const tableData = extractDnD5eTableFields(data);
  const { fields, values } = prepareEntityFields(tableData, true);

  // Lock the parent row even for a child-only write so concurrent replacements serialize.
  const [result] = await connection.execute<ResultSetHeader>(
    `UPDATE dnd5e.entities SET ${fields.join(", ") || "id = id"} WHERE id = ?`,
    [...values, entityId]
  );
  if (result.affectedRows === 0) throw new NotFoundError(`Entity with id ${entityId} not found`);

  await upsertSenses(connection, entityId, data.senses, true);
  await upsertConditionImmunities(connection, entityId, data.condition_immunities, true);
  await upsertDamageModifiers(connection, entityId, 'entity_resistances', data.resistances, true);
  await upsertDamageModifiers(connection, entityId, 'entity_vulnerabilities', data.vulnerabilities, true);
  await upsertDamageModifiers(connection, entityId, 'entity_immunities', data.immunities, true);
  await upsertTraits(connection, entityId, data.traits, true);
  await upsertActions(connection, entityId, data.actions, true);
  await upsertSpellcasting(connection, entityId, data.spellcasting, true);
}

export async function getEntityById(entityId: number): Promise<DnD5eEntityDB> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `${ENTITY_SELECT} WHERE c.id = ?`,
    [entityId]
  );
  if (rows.length === 0) throw new NotFoundError(`Entity with id ${entityId} not found`);

  const entity = rows[0] as DnD5eEntityDB;
  await hydrateEntity(dnd5ePool, entity);
  return entity;
}

export async function getEntitiesByIds(entityIds: number[]): Promise<DnD5eEntityDB[]> {
  if (!entityIds || entityIds.length === 0) return [];

  const placeholders = entityIds.map(() => '?').join(',');
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `${ENTITY_SELECT} WHERE c.id IN (${placeholders})`,
    entityIds
  );
  if (rows.length === 0) return [];

  const entities = rows as DnD5eEntityDB[];

  // Batch-fetch all join-table data for the set of IDs
  const [sensesRows]      = await dnd5ePool.execute<RowDataPacket[]>(`SELECT entity_id, sense FROM dnd5e.entity_senses WHERE entity_id IN (${placeholders})`, entityIds);
  const [condImmRows]     = await dnd5ePool.execute<RowDataPacket[]>(`SELECT entity_id, condition_name, condition_note FROM dnd5e.entity_condition_immunities WHERE entity_id IN (${placeholders})`, entityIds);
  const [resistRows]      = await dnd5ePool.execute<RowDataPacket[]>(`SELECT entity_id, damage_type, condition_note FROM dnd5e.entity_resistances WHERE entity_id IN (${placeholders})`, entityIds);
  const [immuneRows]      = await dnd5ePool.execute<RowDataPacket[]>(`SELECT entity_id, damage_type, condition_note FROM dnd5e.entity_immunities WHERE entity_id IN (${placeholders})`, entityIds);
  const [vulnRows]        = await dnd5ePool.execute<RowDataPacket[]>(`SELECT entity_id, damage_type, condition_note FROM dnd5e.entity_vulnerabilities WHERE entity_id IN (${placeholders})`, entityIds);
  const [traitRows]       = await dnd5ePool.execute<RowDataPacket[]>(`SELECT entity_id, name, description, sort_order FROM dnd5e.entity_traits WHERE entity_id IN (${placeholders}) ORDER BY sort_order`, entityIds);
  const [actionRows]      = await dnd5ePool.execute<RowDataPacket[]>(`SELECT entity_id, name, description, action_type, sort_order FROM dnd5e.entity_actions WHERE entity_id IN (${placeholders}) ORDER BY sort_order`, entityIds);

  // Build maps keyed by entity_id
  type R = RowDataPacket & { entity_id: number };
  const byId = <T>(rows: RowDataPacket[], fn: (r: R) => T) => {
    const map = new Map<number, T[]>();
    for (const row of rows as R[]) {
      if (!map.has(row.entity_id)) map.set(row.entity_id, []);
      map.get(row.entity_id)!.push(fn(row));
    }
    return map;
  };

  const sensesMap   = byId(sensesRows,  r => r.sense as string);
  const condImmMap  = byId(condImmRows, r => ({ condition_name: r.condition_name, condition_note: r.condition_note } as ConditionImmunityDB));
  const resistMap   = byId(resistRows,  r => ({ damage_type: r.damage_type, condition_note: r.condition_note } as DamageModifierDB));
  const immuneMap   = byId(immuneRows,  r => ({ damage_type: r.damage_type, condition_note: r.condition_note } as DamageModifierDB));
  const vulnMap     = byId(vulnRows,    r => ({ damage_type: r.damage_type, condition_note: r.condition_note } as DamageModifierDB));
  const traitMap    = byId(traitRows,   r => ({ name: r.name, description: r.description, sort_order: r.sort_order } as EntityTraitDB));
  const spellcastingMap = await fetchSpellcastingForEntities(dnd5ePool, entityIds);
  const actionMap   = byId(actionRows,  r => ({ name: r.name, description: r.description, action_type: r.action_type, sort_order: r.sort_order } as EntityActionDB));

  for (const entity of entities) {
    entity.senses              = sensesMap.get(entity.id)   ?? [];
    entity.condition_immunities = condImmMap.get(entity.id) ?? [];
    entity.resistances         = resistMap.get(entity.id)   ?? [];
    entity.immunities          = immuneMap.get(entity.id)   ?? [];
    entity.vulnerabilities     = vulnMap.get(entity.id)     ?? [];
    entity.traits              = traitMap.get(entity.id)    ?? [];
    entity.actions             = actionMap.get(entity.id)   ?? [];
    entity.spellcasting        = spellcastingMap.get(entity.id) ?? [];
  }

  return entities;
}

export async function getAllEntities(connection: PoolConnection): Promise<DnD5eEntityDB[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `${ENTITY_SELECT} ORDER BY c.name`
  );
  const entities = rows as DnD5eEntityDB[];
  for (const entity of entities) {
    await hydrateEntity(connection, entity);
  }
  return entities;
}

/** shared isFeaturedNpc() in SQL. Expects the dnd5e entity row aliased as `e`. */
const FEATURED_NPC_SQL = "(e.role = 'npc' AND COALESCE(JSON_EXTRACT(e.settings, '$.compendium.featured') = TRUE, FALSE))";

/** shared hasInventory() in SQL: player characters and featured NPCs. Used by dnd5eInventoryModel. */
export const HAS_INVENTORY_SQL = `(e.role = 'pc' OR ${FEATURED_NPC_SQL})`;

// One summary projection for every list, so the general and the assigned-PC lists agree.
const SUMMARY_SELECT = `
  SELECT c.id, c.name, e.role, e.cr, e.hp, e.creature_type, e.size,
         COALESCE(JSON_EXTRACT(e.settings, '$.party.member') = TRUE, FALSE) AS in_party,
         ${FEATURED_NPC_SQL} AS featured_npc,
         ${PROVENANCE_SELECT}
  FROM core.entities c
  JOIN dnd5e.entities e ON c.id = e.id`;

/** Player characters assigned to the user. Expects the core entity row aliased as `c`. */
export const ASSIGNED_PC_WHERE = `
  e.role = 'pc'
  AND EXISTS (SELECT 1 FROM core.user_entities ue WHERE ue.entity_id = c.id AND ue.user_id = ?)`;

export async function getEntitySummaries(): Promise<DnD5eEntitySummaryDB[]> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(`${SUMMARY_SELECT} ORDER BY c.name`);
  return rows as DnD5eEntitySummaryDB[];
}

/** Summaries of the player characters assigned to a user, whether or not they are in the party. */
export async function getAssignedPcSummaries(userId: number): Promise<DnD5eEntitySummaryDB[]> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `${SUMMARY_SELECT} WHERE ${ASSIGNED_PC_WHERE} ORDER BY c.name`,
    [userId]
  );
  return rows as DnD5eEntitySummaryDB[];
}

/** One assigned player character, or null when it is missing, not a PC, or not assigned to the user. */
export async function getAssignedPcById(userId: number, entityId: number): Promise<DnD5eEntityDB | null> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `${ENTITY_SELECT} WHERE c.id = ? AND ${ASSIGNED_PC_WHERE}`,
    [entityId, userId]
  );
  if (rows.length === 0) return null;

  const entity = rows[0] as DnD5eEntityDB;
  await hydrateEntity(dnd5ePool, entity);
  return entity;
}

// ─── Private utilities ────────────────────────────────────────────────────────

function prepareEntityFields(
  data: Record<string, unknown>,
  isUpdate: boolean
): { fields: string[]; values: ExecuteValues[] } {
  const fields: string[] = [];
  const values: ExecuteValues[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const serialized = (typeof value === 'object' && value !== null ? JSON.stringify(value) : value) as ExecuteValues;
    fields.push(isUpdate ? `${key} = ?` : key);
    values.push(serialized);
  }
  return { fields, values };
}

async function createDefaultEntityState(
  templateId: number,
  instanceId: number
): Promise<DnD5eEntityState> {
  const entity = await getEntityById(templateId);
  return {
    instanceId,
    inGrave: false,
    hidden: false,
    templateId,
    initiative: 0,
    maxHp: entity.hp,
    currentHp: entity.hp,
    tempHp: 0,
    isConcentrating: false,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    reactionUsed: false,
    conditions: null,
  };
}

export default {
  saveCarriedHp,
  getCombatProfiles,
  patchSettings,
  getAllEntities,
  getEntityById,
  getEntitiesByIds,
  getEntitySummaries,
  getAssignedPcSummaries,
  getAssignedPcById,
  updateEntity,
  claimTemplateEdit,
  insertEntity,
  createDefaultEntityState,
};

/** The template facts the encounter engine needs; the full template stays out of encounter state. */
export type EntityCombatProfile = {
  id: number;
  name: string;
  hp: number;
  /** HP carried over from the last finished combat; null means full. Only kept for player characters. */
  currentHp: number | null;
  role: DnD5eEntityDB["role"];
  settings: EntitySettings;
  controllerUserIds: number[];
};

export async function getCombatProfiles(ids: number[]): Promise<EntityCombatProfile[]> {
  if (!ids.length) return [];
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT e.id, c.name, e.hp, e.current_hp, e.role, e.settings, ${CONTROLLER_IDS_SELECT} AS controller_user_ids
     FROM dnd5e.entities e
     JOIN core.entities c ON c.id = e.id
     WHERE e.id IN (${ids.map(() => "?").join(",")})`, ids,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    hp: row.hp,
    currentHp: row.current_hp ?? null,
    role: row.role,
    settings: readJsonObjectColumn(row.settings),
    controllerUserIds: readJsonNumberArrayColumn(row.controller_user_ids),
  }));
}

/** Store the HP a player character leaves an encounter with. */
export async function saveCarriedHp(entityId: number, maxHp: number, currentHp: number): Promise<void> {
  await dnd5ePool.execute(
    "UPDATE dnd5e.entities SET hp = ?, current_hp = ? WHERE id = ?",
    [maxHp, currentHp, entityId]
  );
}

/** Merge just the settings row, without replacing any entity collections. */
export async function patchSettings(entityId: number, patch: EntitySettings): Promise<EntitySettings> {
  const connection = await dnd5ePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT settings FROM dnd5e.entities WHERE id = ? FOR UPDATE", [entityId],
    );
    if (!rows[0]) throw new NotFoundError("Entity not found");
    const settings = mergeSettings<EntitySettings>(readJsonObjectColumn(rows[0].settings), patch);
    await connection.execute("UPDATE dnd5e.entities SET settings = ? WHERE id = ?", [JSON.stringify(settings), entityId]);
    await connection.commit();
    return settings;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
