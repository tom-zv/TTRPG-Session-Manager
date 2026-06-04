import type { PartialEntityHandlerMap } from "../types.js";
import { rebuildInitiativeOrder, setInitiativeOrder } from "../../initiative.js";

export const graveHandlers = {
  moveToGrave(state, entity) {
    if (entity.inGrave) return;
    entity.inGrave = true;
    setInitiativeOrder(state, state.initiativeOrder.filter((id) => id !== entity.instanceId));
  },
  restoreFromGrave(state, entity, event) {
    if (!entity.inGrave) return;
    entity.inGrave = false;
    entity.currentHp = event.values.hp;
    entity.maxHp = Math.max(entity.maxHp, entity.currentHp);
    if (entity.currentHp > 0) {
      entity.deathSaveSuccesses = 0;
      entity.deathSaveFailures = 0;
    }
    rebuildInitiativeOrder(state);
  },
  setDeathSaves(_state, entity, event) {
    entity.deathSaveSuccesses = event.values.successes;
    entity.deathSaveFailures = event.values.failures;
  },
} satisfies PartialEntityHandlerMap;
