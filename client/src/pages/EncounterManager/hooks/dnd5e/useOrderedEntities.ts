import { useMemo } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";

/**
 * Derives a stable ordered entity list from the initiative order array.
 * Entities in `initiativeOrder` come first (in order), followed by any
 * entities not yet assigned to the initiative list.
 */
export function useOrderedEntities(
  entities: DnD5eEntity[],
  initiativeOrder: number[]
): DnD5eEntity[] {
  return useMemo(() => {
    const activeEntities = entities.filter((entity) => !entity.inGrave);
    const byId = new Map(activeEntities.map((entity) => [entity.instanceId, entity]));
    const initiativeSet = new Set(initiativeOrder);

    const ordered = initiativeOrder
      .map((id) => byId.get(id))
      .filter((entity): entity is DnD5eEntity => entity !== undefined);

    activeEntities.forEach((entity) => {
      if (!initiativeSet.has(entity.instanceId)) {
        ordered.push(entity);
      }
    });

    return ordered;
  }, [entities, initiativeOrder]);
}
