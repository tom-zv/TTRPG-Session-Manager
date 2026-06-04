import type { DnD5eEncounterState } from "./encounter.js";
import { resolveEncounterSettings } from "./settings.js";
import { setInitiativeOrder } from "./initiative.js";

/** Add new fields to old snapshots without interpreting 0 HP as death. */
export function normalizeDnD5eEncounterState(state: DnD5eEncounterState): DnD5eEncounterState {
  const normalized = structuredClone(state);
  normalized.settings = resolveEncounterSettings(state.settings);
  normalized.entityStates = state.entityStates.map((entity) => ({ ...entity, inGrave: entity.inGrave ?? false }));
  const activeIds = new Set(normalized.entityStates.filter((entity) => !entity.inGrave).map((entity) => entity.instanceId));
  setInitiativeOrder(normalized, [...new Set(state.initiativeOrder)].filter((id) => activeIds.has(id)));
  return normalized;
}
