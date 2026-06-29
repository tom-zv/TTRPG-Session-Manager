import type { DnD5eEncounterState } from "./encounter.js";
import { isEncounterPhase } from "../coreEncounter.js";
import { resolveEncounterSettings } from "./settings.js";
import { setInitiativeOrder } from "./initiative.js";

/** Add new fields to old snapshots without interpreting 0 HP as death. */
export function normalizeDnD5eEncounterState(state: DnD5eEncounterState): DnD5eEncounterState {
  const normalized = structuredClone(state);
  // Snapshots from before phases existed: a round counter above 0 means combat was under way.
  normalized.phase = isEncounterPhase(state.phase) ? state.phase : (state.currentRound > 0 ? "running" : "setup");
  normalized.settings = resolveEncounterSettings(state.settings);
  normalized.entityStates = state.entityStates.map((entity) => ({ ...entity, inGrave: entity.inGrave ?? false, hidden: entity.hidden ?? false }));
  const highestInstanceId = normalized.entityStates.reduce((max, entity) => Math.max(max, entity.instanceId), -1);
  normalized.nextInstanceId = Math.max(Number.isInteger(state.nextInstanceId) ? state.nextInstanceId : 0, highestInstanceId + 1);
  const activeIds = new Set(normalized.entityStates.filter((entity) => !entity.inGrave).map((entity) => entity.instanceId));
  setInitiativeOrder(normalized, [...new Set(state.initiativeOrder)].filter((id) => activeIds.has(id)));
  return normalized;
}
