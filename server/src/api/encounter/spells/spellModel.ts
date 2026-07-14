import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { SpellTagDB, SpellWriteDB } from "./types.js";

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

export async function insertSpell(db: Queryable, spell: SpellWriteDB): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO dnd5e.spells (${WRITE_COLUMNS.join(", ")}) VALUES (${WRITE_COLUMNS.map(() => "?").join(", ")})`,
    writeValues(spell)
  );
  return result.insertId;
}

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
