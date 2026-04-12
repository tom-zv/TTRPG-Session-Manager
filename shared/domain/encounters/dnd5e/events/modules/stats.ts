import { PartialEntityHandlerMap } from "../types.js";
import { DnD5eEncounterState } from "../../encounter.js";

/**
 * Recalculate the initiative order based on current entity initiatives
 */
function updateInitiativeOrder(state: DnD5eEncounterState): void {
  state.initiativeOrder = [...state.entityStates]
    .sort((a, b) => b.initiative - a.initiative)
    .map((e) => e.instanceId);
}

export const statHandlers = {
  setInitiative(state, entity, event): void {
    entity.initiative = event.values.initiative;
    updateInitiativeOrder(state);
  },
} satisfies PartialEntityHandlerMap;
