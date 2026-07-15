import { dnd5ePool } from "src/db.js";
import { NotFoundError } from "../../HttpErrors.js";
import {
  fetchAllSpells,
  fetchSpellById,
  fetchSpellCasters,
  type SpellCasterDB,
  type SpellWithTags,
} from "./spellModel.js";

async function getAllSpells(): Promise<SpellWithTags[]> {
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

export default { getAllSpells, getSpellById, getSpellCasters };
