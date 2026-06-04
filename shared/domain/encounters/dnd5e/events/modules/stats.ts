import { PartialEntityHandlerMap } from "../types.js";
import { DnD5eEncounterState } from "../../encounter.js";
import { rebuildInitiativeOrder } from "../../initiative.js";

/**
 * Recalculate the initiative order based on current entity initiatives
 */
function updateInitiativeOrder(state: DnD5eEncounterState): void {
  rebuildInitiativeOrder(state);
}

export const statHandlers = {
  setInitiative(state, entity, event): void {
    entity.initiative = event.values.initiative;
    updateInitiativeOrder(state);
  },
} satisfies PartialEntityHandlerMap;
