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
  setHidden(_state, entity, event): void {
    entity.hidden = event.values.hidden;
  },
  setInitiative(state, entity, event): void {
    entity.initiative = event.values.initiative;
    updateInitiativeOrder(state);
  },
} satisfies PartialEntityHandlerMap;
