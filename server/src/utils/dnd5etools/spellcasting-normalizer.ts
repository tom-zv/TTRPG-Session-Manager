import type {
  EntitySpellcastingDB,
  SpellcastingLevelDB,
} from "src/api/encounter/entities/dnd5e/types.js";
import { ABILITY_NAMES } from "./constants.js";
import { asArray, asNumber, asString, fitField, isRecord, unique } from "./primitives.js";
import { renderDnd5eToolsText, renderEntryList } from "./text-renderer.js";

export function normalizeSpellcasting(value: unknown, warnings: string[]): EntitySpellcastingDB[] {
  return asArray(value).filter(isRecord).map((spellcasting, index) => {
    const rawDescriptions = [
      ...renderEntryList(spellcasting.headerEntries),
      ...renderEntryList(spellcasting.entries),
      ...renderEntryList(spellcasting.footerEntries),
    ];
    const descriptionText = rawDescriptions.join(" ");

    return {
      name: fitField(
        renderDnd5eToolsText(asString(spellcasting.name) ?? "Spellcasting"),
        64,
        `spellcasting ${index + 1} name`,
        warnings
      ),
      display_as: asString(spellcasting.displayAs),
      ability: normalizeAbility(asString(spellcasting.ability)),
      save_dc: extractSaveDc(descriptionText),
      spell_attack_bonus: extractSpellAttackBonus(descriptionText),
      descriptions: rawDescriptions.map(stripSpellcastingCombatParenthetical),
      levels: normalizeSpellLevels(spellcasting.spells, warnings),
      freq_spells: normalizeFrequencySpells(spellcasting, warnings),
    };
  });
}

function normalizeAbility(value: string | undefined): string | undefined {
  const normalized = value?.toLowerCase();
  return normalized && normalized in ABILITY_NAMES ? normalized : undefined;
}

function extractSaveDc(value: string): number | undefined {
  return asNumber(value.match(/\bDC\s+(\d+)\b/i)?.[1]);
}

function extractSpellAttackBonus(value: string): number | undefined {
  return asNumber(value.match(/([+-]\d+)\s+to hit/i)?.[1]);
}

function stripSpellcastingCombatParenthetical(value: string): string {
  return value
    .replace(
      /\s*\((?=[^)]*(?:spell save\s+DC\s+\d+|[+-]\d+\s+to hit(?:\s+to hit)?(?:\s+with spell attacks)?))[^)]*\)([:.;]?)\s*$/i,
      "$1"
    )
    .replace(/\s+([:.;])$/g, "$1")
    .trim();
}

function normalizeSpellLevels(value: unknown, warnings: string[]): SpellcastingLevelDB[] | undefined {
  if (!isRecord(value)) return undefined;

  const levels = Object.entries(value).map(([levelKey, levelValue]) => {
    const level = Number(levelKey);
    const levelRecord = isRecord(levelValue) ? levelValue : {};
    const spellsValue = isRecord(levelValue) ? levelRecord.spells : levelValue;
    const spells = asArray(spellsValue)
      .map(spell => normalizeSpellName(spell, warnings))
      .filter((spell): spell is string => Boolean(spell));

    return {
      level,
      slots: asNumber(levelRecord.slots),
      spells,
    };
  }).filter(level => Number.isInteger(level.level) && level.spells.length > 0);

  return levels.length > 0 ? levels.sort((a, b) => a.level - b.level) : undefined;
}

function normalizeFrequencySpells(spellcasting: Record<string, unknown>, warnings: string[]): Record<string, string[]> | undefined {
  const freqSpells: Record<string, string[]> = {};

  addFrequencySpellList(freqSpells, "will", spellcasting.will, warnings);
  addFrequencySpellList(freqSpells, "constant", spellcasting.constant, warnings);

  for (const freq of ["daily", "weekly", "rest", "ritual"]) {
    const value = spellcasting[freq];
    if (!isRecord(value)) continue;

    for (const [detail, spells] of Object.entries(value)) {
      addFrequencySpellList(freqSpells, `${freq}_${detail}`, spells, warnings);
    }
  }

  return Object.keys(freqSpells).length > 0 ? freqSpells : undefined;
}

function addFrequencySpellList(
  freqSpells: Record<string, string[]>,
  key: string,
  value: unknown,
  warnings: string[]
): void {
  const spells = asArray(value)
    .map(spell => normalizeSpellName(spell, warnings))
    .filter((spell): spell is string => Boolean(spell));

  if (spells.length > 0) freqSpells[key] = unique([...(freqSpells[key] ?? []), ...spells]);
}

function normalizeSpellName(value: unknown, warnings: string[]): string | undefined {
  let rawName: string | undefined;

  if (typeof value === "string") {
    rawName = value.match(/\{@spell ([^|}]+)/i)?.[1] ?? renderDnd5eToolsText(value).split("(")[0]?.trim();
  } else if (isRecord(value)) {
    rawName = asString(value.name) ?? asString(value.spell);
  }

  if (!rawName) return undefined;
  return fitField(renderDnd5eToolsText(rawName), 64, "spell name", warnings);
}
