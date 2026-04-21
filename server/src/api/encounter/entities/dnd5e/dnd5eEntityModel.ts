import { dnd5ePool } from "src/db.js";
import {
  DnD5eEntitySummaryDB,
  DnD5eEntityDB,
  DamageModifierDB,
  ConditionImmunityDB,
  EntityTraitDB,
  EntityActionDB,
  EntitySpellcastingDB,
} from "./types.js";
import { RowDataPacket, PoolConnection } from "mysql2/promise";
import { DnD5eEntityState } from "shared/domain/encounters/dnd5e/entity.js";

// Columns that live on the dnd5e.entities main row
interface DnD5eEntityTableData {
  role: 'pc' | 'npc' | 'creature';
  creature_type?: string;
  type_tags?: string[];
  cr?: string;
  ac: number;
  hp: number;
  hp_formula?: string;
  speeds: { [key: string]: number };
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  alignment: string;
  ability_scores: {
    str: number; dex: number; con: number;
    int: number; wis: number; cha: number;
  };
  saves?: { [key: string]: string };
  skills?: { [key: string]: string };
  passive_perception?: number;
  languages?: string[];
  legendary_action_count?: number;
  legendary_header?: string[];
}

function extractDnD5eTableFields(data: Omit<DnD5eEntityDB, "id" | "created_at">): DnD5eEntityTableData {
  return {
    role: data.role,
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
const ENTITY_SELECT = `
  SELECT
    c.id, c.name, c.image_url, c.created_at,
    e.role, e.creature_type, e.type_tags, e.cr,
    e.ac, e.hp, e.hp_formula, e.speeds, e.size, e.alignment,
    e.ability_scores, e.saves, e.skills,
    e.passive_perception, e.languages,
    e.legendary_action_count, e.legendary_header
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

async function fetchSpellcasting(pool: PoolConnection | typeof dnd5ePool, entityId: number): Promise<EntitySpellcastingDB[]> {
  const [scRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, display_as, ability, save_dc, spell_attack_bonus
     FROM dnd5e.entity_spellcasting WHERE entity_id = ?`,
    [entityId]
  );
  if (scRows.length === 0) return [];

  const result: EntitySpellcastingDB[] = [];
  for (const sc of scRows) {
    const scId = sc.id as number;

    const [descRows] = await pool.execute<RowDataPacket[]>(
      `SELECT description FROM dnd5e.entity_spellcasting_descriptions
       WHERE spellcasting_id = ? ORDER BY description_order`,
      [scId]
    );

    const [slotRows] = await pool.execute<RowDataPacket[]>(
      `SELECT spell_level, slots FROM dnd5e.entity_spell_slots WHERE spellcasting_id = ? ORDER BY spell_level`,
      [scId]
    );

    const [spellRows] = await pool.execute<RowDataPacket[]>(
      `SELECT spell_name, spell_level, usage_freq, usage_detail
       FROM dnd5e.entity_spells WHERE spellcasting_id = ?`,
      [scId]
    );

    // Build slot-based levels
    const levelMap = new Map<number, { slots?: number; spells: string[] }>();
    for (const slot of slotRows) {
      levelMap.set(slot.spell_level as number, { slots: slot.slots as number | undefined, spells: [] });
    }
    // Attach slot-based spells
    const freqSpells: { [freq: string]: string[] } = {};
    for (const spell of spellRows) {
      if (spell.usage_freq) {
        const key = spell.usage_detail ? `${spell.usage_freq}_${spell.usage_detail}` : spell.usage_freq as string;
        if (!freqSpells[key]) freqSpells[key] = [];
        freqSpells[key].push(spell.spell_name as string);
      } else if (spell.spell_level != null) {
        const entry = levelMap.get(spell.spell_level as number);
        if (entry) entry.spells.push(spell.spell_name as string);
      }
    }

    result.push({
      name: sc.name as string,
      display_as: sc.display_as as string | undefined,
      ability: sc.ability as string | undefined,
      save_dc: sc.save_dc as number | undefined,
      spell_attack_bonus: sc.spell_attack_bonus as number | undefined,
      descriptions: descRows.map(d => d.description as string),
      levels: levelMap.size > 0
        ? Array.from(levelMap.entries()).map(([level, data]) => ({ level, slots: data.slots, spells: data.spells }))
        : undefined,
      freq_spells: Object.keys(freqSpells).length > 0 ? freqSpells : undefined,
    });
  }
  return result;
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
  entity.spellcasting        = await fetchSpellcasting(pool, id);
}

// ─── Write helpers ────────────────────────────────────────────────────────────

async function upsertSenses(conn: PoolConnection, entityId: number, senses: string[] | undefined, isUpdate: boolean): Promise<void> {
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_senses WHERE entity_id = ?`, [entityId]);
  if (!senses || senses.length === 0) return;
  for (const sense of senses) {
    await conn.execute(`INSERT INTO dnd5e.entity_senses (entity_id, sense) VALUES (?, ?)`, [entityId, sense]);
  }
}

async function upsertConditionImmunities(conn: PoolConnection, entityId: number, items: ConditionImmunityDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_condition_immunities WHERE entity_id = ?`, [entityId]);
  if (!items || items.length === 0) return;
  for (const item of items) {
    await conn.execute(
      `INSERT INTO dnd5e.entity_condition_immunities (entity_id, condition_name, condition_note) VALUES (?, ?, ?)`,
      [entityId, item.condition_name, item.condition_note ?? null]
    );
  }
}

async function upsertDamageModifiers(conn: PoolConnection, entityId: number, table: string, items: DamageModifierDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.${table} WHERE entity_id = ?`, [entityId]);
  if (!items || items.length === 0) return;
  for (const item of items) {
    await conn.execute(
      `INSERT INTO dnd5e.${table} (entity_id, damage_type, condition_note) VALUES (?, ?, ?)`,
      [entityId, item.damage_type, item.condition_note ?? null]
    );
  }
}

async function upsertTraits(conn: PoolConnection, entityId: number, traits: EntityTraitDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_traits WHERE entity_id = ?`, [entityId]);
  if (!traits || traits.length === 0) return;
  for (let i = 0; i < traits.length; i++) {
    const t = traits[i];
    await conn.execute(
      `INSERT INTO dnd5e.entity_traits (entity_id, name, description, sort_order) VALUES (?, ?, ?, ?)`,
      [entityId, t.name, t.description, t.sort_order ?? i]
    );
  }
}

async function upsertActions(conn: PoolConnection, entityId: number, actions: EntityActionDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_actions WHERE entity_id = ?`, [entityId]);
  if (!actions || actions.length === 0) return;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    await conn.execute(
      `INSERT INTO dnd5e.entity_actions (entity_id, name, description, action_type, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [entityId, a.name, a.description, a.action_type, a.sort_order ?? i]
    );
  }
}

async function upsertSpellcasting(conn: PoolConnection, entityId: number, spellcasting: EntitySpellcastingDB[] | undefined, isUpdate: boolean): Promise<void> {
  if (isUpdate) await conn.execute(`DELETE FROM dnd5e.entity_spellcasting WHERE entity_id = ?`, [entityId]);
  if (!spellcasting || spellcasting.length === 0) return;

  for (const sc of spellcasting) {
    const [result] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO dnd5e.entity_spellcasting (entity_id, name, display_as, ability, save_dc, spell_attack_bonus)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [entityId, sc.name, sc.display_as ?? null, sc.ability ?? null, sc.save_dc ?? null, sc.spell_attack_bonus ?? null]
    );
    const scId = result.insertId;

    for (let i = 0; i < (sc.descriptions ?? []).length; i++) {
      await conn.execute(
        `INSERT INTO dnd5e.entity_spellcasting_descriptions (spellcasting_id, description_order, description) VALUES (?, ?, ?)`,
        [scId, i, sc.descriptions[i]]
      );
    }

    if (sc.levels) {
      for (const lvl of sc.levels) {
        await conn.execute(
          `INSERT INTO dnd5e.entity_spell_slots (spellcasting_id, spell_level, slots) VALUES (?, ?, ?)`,
          [scId, lvl.level, lvl.slots ?? null]
        );
        for (const spellName of lvl.spells ?? []) {
          await conn.execute(
            `INSERT INTO dnd5e.entity_spells (spellcasting_id, spell_name, spell_level) VALUES (?, ?, ?)`,
            [scId, spellName, lvl.level]
          );
        }
      }
    }

    if (sc.freq_spells) {
      for (const [freqKey, spells] of Object.entries(sc.freq_spells)) {
        // freqKey format: 'will' | 'daily_1e' | 'daily_2' etc.
        const underscoreIdx = freqKey.indexOf('_');
        const freq   = underscoreIdx >= 0 ? freqKey.slice(0, underscoreIdx) : freqKey;
        const detail = underscoreIdx >= 0 ? freqKey.slice(underscoreIdx + 1) : null;
        for (const spellName of spells) {
          await conn.execute(
            `INSERT INTO dnd5e.entity_spells (spellcasting_id, spell_name, usage_freq, usage_detail) VALUES (?, ?, ?, ?)`,
            [scId, spellName, freq, detail]
          );
        }
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function insertEntity(
  connection: PoolConnection,
  entityId: number,
  data: Omit<DnD5eEntityDB, "id" | "created_at">
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

export async function updateEntity(
  connection: PoolConnection,
  entityId: number,
  data: Omit<DnD5eEntityDB, "id" | "created_at">
): Promise<void> {
  const tableData = extractDnD5eTableFields(data);
  const { fields, values } = prepareEntityFields(tableData, true);

  await connection.execute(
    `UPDATE dnd5e.entities SET ${fields.join(", ")} WHERE id = ?`,
    [...values, entityId]
  );

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
  if (rows.length === 0) throw new Error(`Entity with id ${entityId} not found`);

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
  const actionMap   = byId(actionRows,  r => ({ name: r.name, description: r.description, action_type: r.action_type, sort_order: r.sort_order } as EntityActionDB));

  for (const entity of entities) {
    entity.senses              = sensesMap.get(entity.id)   ?? [];
    entity.condition_immunities = condImmMap.get(entity.id) ?? [];
    entity.resistances         = resistMap.get(entity.id)   ?? [];
    entity.immunities          = immuneMap.get(entity.id)   ?? [];
    entity.vulnerabilities     = vulnMap.get(entity.id)     ?? [];
    entity.traits              = traitMap.get(entity.id)    ?? [];
    entity.actions             = actionMap.get(entity.id)   ?? [];
    // Spellcasting fetched individually (complex multi-table shape)
    entity.spellcasting        = await fetchSpellcasting(dnd5ePool, entity.id);
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

export async function getEntitySummaries(): Promise<DnD5eEntitySummaryDB[]> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT c.id, c.name, e.role, e.cr, e.hp
     FROM core.entities c
     JOIN dnd5e.entities e ON c.id = e.id
     ORDER BY c.name`
  );
  return rows as DnD5eEntitySummaryDB[];
}

// ─── Private utilities ────────────────────────────────────────────────────────

function prepareEntityFields(
  data: DnD5eEntityTableData,
  isUpdate: boolean
): { fields: string[]; values: unknown[] } {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const serialized = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
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
  getAllEntities,
  getEntityById,
  getEntitiesByIds,
  getEntitySummaries,
  updateEntity,
  insertEntity,
  createDefaultEntityState,
};
