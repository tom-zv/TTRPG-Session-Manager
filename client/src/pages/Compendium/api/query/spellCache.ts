import type { QueryClient } from "@tanstack/react-query";
import type { Spell, SpellSummary } from "shared/domain/dnd5e/spell.js";
import { SPELL_KEYS } from "./keys.js";

const toSummary = (spell: Spell): SpellSummary => ({
  id: spell.id,
  name: spell.name,
  source: spell.source,
  level: spell.level,
  school: spell.school,
  ritual: spell.ritual,
  concentration: spell.concentration,
  castingTime: spell.castingTime,
  castingUnit: spell.castingUnit,
  components: spell.components,
  classes: spell.classes,
  damageTypes: spell.damageTypes,
  saves: spell.saves,
  aliases: spell.aliases,
});

export function storeSpell(queryClient: QueryClient, spell: Spell): void {
  void queryClient.cancelQueries({ queryKey: SPELL_KEYS.index() });
  void queryClient.cancelQueries({ queryKey: SPELL_KEYS.detail(spell.id) });
  queryClient.setQueryData<Spell>(SPELL_KEYS.detail(spell.id), spell);
  queryClient.setQueryData<SpellSummary[]>(SPELL_KEYS.index(), old => {
    const summary = toSummary(spell);
    if (!old) return undefined;
    return [...old.filter(existing => existing.id !== spell.id), summary]
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });
  if (!queryClient.getQueryData(SPELL_KEYS.index())) {
    void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.index() });
  }
  // A rename or new alias changes which creatures match.
  void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.casters(spell.id) });
}
