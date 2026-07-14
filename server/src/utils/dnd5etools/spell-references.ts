import type { DnD5eEntityDB } from "src/api/encounter/entities/dnd5e/types.js";
import { parseInlineTags } from "shared/domain/dnd5e/richText.js";
import { buildSpellLookup, resolveSpell, spellKey, type SpellRef } from "shared/domain/dnd5e/spell.js";

type EntityText = Pick<DnD5eEntityDB, "name" | "traits" | "actions" | "spellcasting" | "legendary_header">;

export interface UnresolvedSpellRef extends SpellRef {
  entities: string[];
}

// Spell list entries plus inline {@spell} tags in the entity's description text.
export function collectEntitySpellRefs(entity: EntityText): SpellRef[] {
  const refs: SpellRef[] = [];
  const fromText = (text: string) => {
    for (const token of parseInlineTags(text)) {
      if (token.type === "spell") refs.push({ name: token.name, source: token.source });
    }
  };

  for (const entry of [...(entity.traits ?? []), ...(entity.actions ?? [])]) fromText(entry.description);
  for (const line of entity.legendary_header ?? []) fromText(line);
  for (const block of entity.spellcasting ?? []) {
    block.descriptions.forEach(fromText);
    for (const group of [...(block.levels ?? []), ...(block.frequency_groups ?? [])]) {
      refs.push(...group.spells.map(spell => ({ name: spell.name, source: spell.source })));
    }
  }
  return refs;
}

export function findUnresolvedSpellRefs(
  entities: EntityText[],
  spells: Array<{ name: string; source: string; aliases: string[] }>
): UnresolvedSpellRef[] {
  const lookup = buildSpellLookup(spells);
  const unresolved = new Map<string, UnresolvedSpellRef>();

  for (const entity of entities) {
    for (const ref of collectEntitySpellRefs(entity)) {
      if (resolveSpell(lookup, ref)) continue;
      const key = spellKey(ref.name, ref.source);
      const entry = unresolved.get(key) ?? { ...ref, entities: [] };
      if (!entry.entities.includes(entity.name)) entry.entities.push(entity.name);
      unresolved.set(key, entry);
    }
  }
  return [...unresolved.values()].sort((left, right) => left.name.localeCompare(right.name));
}
