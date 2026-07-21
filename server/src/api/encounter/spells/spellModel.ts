import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { SpellDB, SpellSummaryDB, SpellTagDB, SpellWriteDB } from "./types.js";

type Queryable = Pool | PoolConnection;

const WRITE_COLUMNS = [
  "name",
  "source",
  "page",
  "level",
  "school",
  "ritual",
  "concentration",
  "casting_time",
  "casting_unit",
  "casting_trigger",
  "range_text",
  "range_feet",
  "comp_v",
  "comp_s",
  "comp_m",
  "material",
  "material_cost_cp",
  "material_consumed",
  "duration",
  "description",
  "higher_levels",
] as const satisfies ReadonlyArray<keyof SpellWriteDB>;

const writeValues = (spell: SpellWriteDB) => WRITE_COLUMNS.map(column => spell[column]);

export async function findSpellIdByNameSource(
  db: Queryable,
  name: string,
  source: string,
  options: { forUpdate?: boolean } = {}
): Promise<{ id: number; locallyEdited: boolean } | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, locally_edited FROM dnd5e.spells WHERE name = ? AND source = ?${options.forUpdate ? " FOR UPDATE" : ""}`,
    [name, source]
  );
  return rows[0] ? { id: rows[0].id as number, locallyEdited: Boolean(rows[0].locally_edited) } : undefined;
}

// locallyEdited: true for spells made in the app, so an import never overwrites them.
export async function insertSpell(db: Queryable, spell: SpellWriteDB, locallyEdited = false): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO dnd5e.spells (${WRITE_COLUMNS.join(", ")}, locally_edited) VALUES (${WRITE_COLUMNS.map(() => "?").join(", ")}, ?)`,
    [...writeValues(spell), locallyEdited]
  );
  return result.insertId;
}

export async function deleteSpell(db: Queryable, id: number): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>("DELETE FROM dnd5e.spells WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

export const isDuplicateEntryError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";

// locallyEdited: true for edits made in the app, false when an import overwrites the row.
export async function updateSpell(
  db: Queryable,
  id: number,
  spell: SpellWriteDB,
  locallyEdited: boolean
): Promise<void> {
  await db.execute(
    `UPDATE dnd5e.spells SET ${WRITE_COLUMNS.map(column => `${column} = ?`).join(", ")}, locally_edited = ? WHERE id = ?`,
    [...writeValues(spell), locallyEdited, id]
  );
}

export async function replaceSpellTags(db: Queryable, spellId: number, tags: SpellTagDB[]): Promise<void> {
  await db.execute("DELETE FROM dnd5e.spell_tags WHERE spell_id = ?", [spellId]);
  if (tags.length === 0) return;
  await db.query(
    "INSERT INTO dnd5e.spell_tags (spell_id, tag_type, tag) VALUES ?",
    [tags.map(tag => [spellId, tag.tag_type, tag.tag])]
  );
}

// Name, source and aliases of every spell: enough to resolve references (shared resolveSpell).
export async function fetchSpellRefIndex(
  db: Queryable
): Promise<Array<{ id: number; name: string; source: string; aliases: string[] }>> {
  const [spells] = await db.query<RowDataPacket[]>("SELECT id, name, source FROM dnd5e.spells");
  const [aliases] = await db.query<RowDataPacket[]>(
    "SELECT spell_id, tag FROM dnd5e.spell_tags WHERE tag_type = 'alias'"
  );
  const aliasesById = new Map<number, string[]>();
  for (const row of aliases) {
    const list = aliasesById.get(row.spell_id as number) ?? [];
    list.push(row.tag as string);
    aliasesById.set(row.spell_id as number, list);
  }
  return spells.map(row => ({
    id: row.id as number,
    name: row.name as string,
    source: row.source as string,
    aliases: aliasesById.get(row.id as number) ?? [],
  }));
}

const mapSpellRow = (row: RowDataPacket): SpellDB => ({
  id: row.id as number,
  name: row.name as string,
  source: row.source as string,
  page: row.page as number | null,
  level: row.level as number,
  school: row.school as SpellDB["school"],
  ritual: Boolean(row.ritual),
  concentration: Boolean(row.concentration),
  casting_time: row.casting_time as string,
  casting_unit: row.casting_unit as SpellDB["casting_unit"],
  casting_trigger: row.casting_trigger as string | null,
  range_text: row.range_text as string,
  range_feet: row.range_feet as number | null,
  comp_v: Boolean(row.comp_v),
  comp_s: Boolean(row.comp_s),
  comp_m: Boolean(row.comp_m),
  material: row.material as string | null,
  material_cost_cp: row.material_cost_cp as number | null,
  material_consumed: Boolean(row.material_consumed),
  duration: row.duration as string,
  description: row.description as string,
  higher_levels: row.higher_levels as string | null,
  locally_edited: Boolean(row.locally_edited),
  created_at: row.created_at as Date,
  updated_at: row.updated_at as Date,
});

export interface SpellWithTags {
  spell: SpellDB;
  tags: SpellTagDB[];
}

export interface SpellSummaryWithTags {
  spell: SpellSummaryDB;
  tags: SpellTagDB[];
}

// The catalog never reads full text or detail-only tags.
export async function fetchAllSpells(db: Queryable): Promise<SpellSummaryWithTags[]> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT id, name, source, level, school, ritual, concentration, casting_time, casting_unit,
            comp_v, comp_s, comp_m FROM dnd5e.spells ORDER BY level, name`);
  const [tagRows] = await db.query<RowDataPacket[]>("SELECT spell_id, tag_type, tag FROM dnd5e.spell_tags WHERE tag_type IN ('class', 'damage', 'save', 'alias') ORDER BY tag");

  const tagsById = new Map<number, SpellTagDB[]>();
  for (const row of tagRows) {
    const list = tagsById.get(row.spell_id as number) ?? [];
    list.push({ tag_type: row.tag_type as SpellTagDB["tag_type"], tag: row.tag as string });
    tagsById.set(row.spell_id as number, list);
  }
  return rows.map(row => ({ spell: {
    id: row.id as number, name: row.name as string, source: row.source as string,
    level: row.level as number, school: row.school as SpellSummaryDB["school"],
    ritual: Boolean(row.ritual), concentration: Boolean(row.concentration),
    casting_time: row.casting_time as string, casting_unit: row.casting_unit as SpellSummaryDB["casting_unit"],
    comp_v: Boolean(row.comp_v), comp_s: Boolean(row.comp_s), comp_m: Boolean(row.comp_m),
  }, tags: tagsById.get(row.id as number) ?? [] }));
}

export async function fetchSpellById(db: Queryable, id: number): Promise<SpellWithTags | null> {
  const [rows] = await db.execute<RowDataPacket[]>("SELECT * FROM dnd5e.spells WHERE id = ?", [id]);
  if (rows.length === 0) return null;

  const [tagRows] = await db.execute<RowDataPacket[]>(
    "SELECT tag_type, tag FROM dnd5e.spell_tags WHERE spell_id = ? ORDER BY tag",
    [id]
  );
  return {
    spell: mapSpellRow(rows[0]),
    tags: tagRows.map(row => ({ tag_type: row.tag_type as SpellTagDB["tag_type"], tag: row.tag as string })),
  };
}

export interface SpellCasterDB {
  id: number;
  name: string;
}

// Entities whose spell lists name this spell (by name or alias). A list entry without a source matches any source.
export async function fetchSpellCasters(
  db: Queryable,
  names: string[],
  source: string
): Promise<SpellCasterDB[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT c.id, c.name
     FROM dnd5e.entity_spells es
     JOIN dnd5e.entity_spellcasting sc ON sc.id = es.spellcasting_id
     JOIN core.entities c ON c.id = sc.entity_id
     WHERE es.spell_name IN (?) AND (es.spell_source IS NULL OR es.spell_source = ?)
     ORDER BY c.name`,
    [names, source]
  );
  return rows.map(row => ({ id: row.id as number, name: row.name as string }));
}
