import type { EntityActionDB, EntityTraitDB } from "src/api/encounter/entities/dnd5e/types.js";
import type { Dnd5eToolsMonster } from "./types.js";
import { asArray, asString, fitField, isRecord, titleCase } from "./primitives.js";
import { renderDnd5eToolsText, renderEntry, renderEntryList } from "./text-renderer.js";

export function normalizeActions(monster: Dnd5eToolsMonster, warnings: string[]): EntityActionDB[] {
  const actionSections: Array<{ field: string; actionType: string }> = [
    { field: "action", actionType: "action" },
    { field: "bonus", actionType: "bonus action" },
    { field: "reaction", actionType: "reaction" },
    { field: "legendary", actionType: "legendary" },
    { field: "mythic", actionType: "mythic" },
    { field: "lairActions", actionType: "lair" },
  ];

  const actions: EntityActionDB[] = [];
  for (const section of actionSections) {
    const entries = normalizeNamedEntries(monster[section.field], section.field, warnings);
    for (const entry of entries) {
      actions.push({
        name: entry.name,
        description: entry.description,
        action_type: section.actionType,
        sort_order: actions.length,
      });
    }
  }

  return actions;
}

export function normalizeNamedEntries(value: unknown, fieldName: string, warnings: string[]): EntityTraitDB[] {
  return asArray(value).map((entry, index) => {
    if (isRecord(entry)) {
      return {
        name: fitField(renderDnd5eToolsText(asString(entry.name) ?? titleCase(fieldName)), 64, `${fieldName} name`, warnings),
        description: renderEntryList(entry.entries ?? entry.entry).join("\n"),
        sort_order: index,
      };
    }

    return {
      name: fitField(titleCase(fieldName), 64, `${fieldName} name`, warnings),
      description: renderEntry(entry),
      sort_order: index,
    };
  }).filter(entry => entry.description.length > 0 || entry.name.length > 0);
}
