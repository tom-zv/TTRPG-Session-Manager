import type { PoolConnection } from "mysql2/promise";
import { dnd5ePool } from "src/db.js";
import { HttpError, NotFoundError } from "../../HttpErrors.js";
import type { SpellInput } from "shared/domain/dnd5e/spell.js";
import { spellInputToDb } from "src/utils/format-transformers/encounter-transformers/dnd5e/spell-transformer.js";
import {
  deleteSpell as deleteSpellRow,
  fetchAllSpells,
  fetchSpellById,
  fetchSpellCasters,
  findSpellIdByNameSource,
  insertSpell,
  isDuplicateEntryError,
  replaceSpellTags,
  updateSpell as updateSpellRow,
  type SpellCasterDB,
  type SpellWithTags,
  type SpellSummaryWithTags,
} from "./spellModel.js";

async function getAllSpells(): Promise<SpellSummaryWithTags[]> {
  return fetchAllSpells(dnd5ePool);
}

async function getSpellById(id: number): Promise<SpellWithTags> {
  const spell = await fetchSpellById(dnd5ePool, id);
  if (!spell) throw new NotFoundError("Spell not found");
  return spell;
}

// Entities that list the spell, by its name or an alias.
async function getSpellCasters(id: number): Promise<SpellCasterDB[]> {
  const { spell, tags } = await getSpellById(id);
  const aliases = tags.filter(tag => tag.tag_type === "alias").map(tag => tag.tag);
  return fetchSpellCasters(dnd5ePool, [spell.name, ...aliases], spell.source);
}

const duplicateError = (input: SpellInput) =>
  new HttpError(409, `A spell named "${input.name.trim()}" already exists in ${input.source.trim()}.`);

async function inTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await dnd5ePool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Spells made in the app are marked as edited, so a later import never overwrites them.
async function createSpell(input: SpellInput): Promise<SpellWithTags> {
  const { spell, tags } = spellInputToDb(input);
  try {
    const id = await inTransaction(async connection => {
      const spellId = await insertSpell(connection, spell, true);
      await replaceSpellTags(connection, spellId, tags);
      return spellId;
    });
    return getSpellById(id);
  } catch (error) {
    if (isDuplicateEntryError(error)) throw duplicateError(input);
    throw error;
  }
}

async function updateSpell(id: number, input: SpellInput): Promise<SpellWithTags> {
  const { spell, tags } = spellInputToDb(input);
  try {
    await inTransaction(async connection => {
      const existing = await fetchSpellById(connection, id);
      if (!existing) throw new NotFoundError("Spell not found");
      const clash = await findSpellIdByNameSource(connection, spell.name, spell.source);
      if (clash && clash.id !== id) throw duplicateError(input);
      await updateSpellRow(connection, id, spell, true);
      await replaceSpellTags(connection, id, tags);
    });
    return getSpellById(id);
  } catch (error) {
    if (isDuplicateEntryError(error)) throw duplicateError(input);
    throw error;
  }
}

async function deleteSpell(id: number): Promise<void> {
  const deleted = await deleteSpellRow(dnd5ePool, id);
  if (!deleted) throw new NotFoundError("Spell not found");
}

export default { getAllSpells, getSpellById, getSpellCasters, createSpell, updateSpell, deleteSpell };
