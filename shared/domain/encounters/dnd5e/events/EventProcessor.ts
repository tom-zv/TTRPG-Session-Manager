import { DnD5eEncounterState } from "../encounter.js";
import { DnD5eEntityState } from "../entity.js";
import { DnD5eEncounterEvent, EntityEvent, isEntityEvent } from "./types.js";
import { EntityHandlers, GlobalHandlers } from "./modules/index.js";

export class DnD5eEventProcessor {
  static applyEvent(encounter: DnD5eEncounterState, event: DnD5eEncounterEvent): void {
    if (isEntityEvent(event)) {
      const entity = DnD5eEventProcessor.findEntity(encounter, event.values.targetId);
      
      const handler = EntityHandlers[event.type] as (
        state: DnD5eEncounterState,
        entity: DnD5eEntityState,
        evnt: Extract<EntityEvent, { type: typeof event.type }>
      ) => void;

      handler(encounter, entity, event);
      return;
    } else {
      const handler = GlobalHandlers[event.type] as (
        state: DnD5eEncounterState,
        evnt: Extract<DnD5eEncounterEvent, { type: typeof event.type }>
      ) => void;

      handler(encounter, event as Extract<DnD5eEncounterEvent, { type: typeof event.type }>);
    }
  }

  private static findEntity(state: DnD5eEncounterState, instanceId: number): DnD5eEntityState {
    const entity = state.entityStates.find((e) => e.instanceId === instanceId);
    if (!entity) throw new Error(`Entity ${instanceId} not found`);
    return entity;
  }
}