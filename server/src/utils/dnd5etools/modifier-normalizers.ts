import type {
  ConditionImmunityDB,
  DamageModifierDB,
} from "src/api/encounter/entities/dnd5e/types.js";
import { STANDARD_DAMAGE_TYPES } from "./constants.js";
import { asString, fitField, isRecord, uniqueBy } from "./primitives.js";
import { combineNotes, renderDnd5eToolsText, renderEntry } from "./text-renderer.js";

export function normalizeDamageModifiers(value: unknown, fieldName: string, warnings: string[]): DamageModifierDB[] {
  const modifiers: DamageModifierDB[] = [];

  const visit = (entry: unknown, inheritedNote?: string): void => {
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item, inheritedNote);
      return;
    }

    if (typeof entry === "string") {
      addDamageModifierText(modifiers, entry, inheritedNote, fieldName, warnings);
      return;
    }

    if (!isRecord(entry)) return;

    const note = combineNotes(inheritedNote, asString(entry.preNote), asString(entry.note), asString(entry.condition_note));
    const nested = entry[fieldName] ?? entry.resist ?? entry.immune ?? entry.vulnerable;

    if (nested !== undefined) {
      visit(nested, note);
    } else if (entry.special !== undefined) {
      addDamageModifierText(modifiers, renderEntry(entry.special), note, fieldName, warnings);
    }
  };

  visit(value);
  return uniqueBy(modifiers, item => `${item.damage_type}:${item.condition_note ?? ""}`);
}

export function normalizeConditionImmunities(value: unknown, warnings: string[]): ConditionImmunityDB[] {
  const immunities: ConditionImmunityDB[] = [];

  const visit = (entry: unknown, inheritedNote?: string): void => {
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item, inheritedNote);
      return;
    }

    if (typeof entry === "string") {
      immunities.push({ condition_name: renderDnd5eToolsText(entry).toLowerCase(), condition_note: inheritedNote });
      return;
    }

    if (!isRecord(entry)) return;

    const note = combineNotes(inheritedNote, asString(entry.preNote), asString(entry.note), asString(entry.condition_note));
    const nested = entry.conditionImmune ?? entry.immune;
    if (nested !== undefined) {
      visit(nested, note ? fitField(note, 256, "condition immunity note", warnings) : undefined);
    }
  };

  visit(value);
  return uniqueBy(immunities, item => `${item.condition_name}:${item.condition_note ?? ""}`);
}

function addDamageModifierText(
  modifiers: DamageModifierDB[],
  value: string,
  inheritedNote: string | undefined,
  fieldName: string,
  warnings: string[]
): void {
  const rendered = renderDnd5eToolsText(value).toLowerCase();
  const exact = rendered.replace(/\s+damage\b/g, "").trim();

  if (STANDARD_DAMAGE_TYPES.has(exact)) {
    modifiers.push({ damage_type: exact, condition_note: inheritedNote });
    return;
  }

  const matchedTypes = Array.from(STANDARD_DAMAGE_TYPES).filter(type => new RegExp(`\\b${type}\\b`, "i").test(rendered));
  if (matchedTypes.length === 0) {
    warnings.push(`Skipped ${fieldName} damage modifier "${rendered}" because it does not include a standard damage type.`);
    return;
  }

  const note = inheritedNote ?? extractDamageConditionNote(rendered, matchedTypes);
  for (const damageType of matchedTypes) {
    modifiers.push({
      damage_type: damageType,
      condition_note: note ? fitField(note, 256, `${fieldName} condition_note`, warnings) : undefined,
    });
  }
}

function extractDamageConditionNote(value: string, damageTypes: string[]): string | undefined {
  let note = value;
  for (const damageType of damageTypes) {
    note = note.replace(new RegExp(`\\b${damageType}\\b`, "gi"), "");
  }

  note = note
    .replace(/\bdamage\b/gi, "")
    .replace(/\b(and|or)\b/gi, " ")
    .replace(/[;,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return note || undefined;
}
