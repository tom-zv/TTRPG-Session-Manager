import { useMemo } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";

/**
 * Resolves the effective selected entity ID from user state.
 *
 * - If the user-selected entity is still present in the list, keep it.
 * - Otherwise fall back to `preferredFallbackId` (e.g. the current-turn
 *   entity in a live encounter), then to the first entity in the list.
 */
export function useEntitySelection(
  orderedEntities: DnD5eEntity[],
  userSelectedId: number | undefined,
  preferredFallbackId?: number
): number | undefined {
  return useMemo(() => {
    const isStillPresent = orderedEntities.some(
      (entity) => entity.instanceId === userSelectedId
    );

    if (isStillPresent) {
      return userSelectedId;
    }

    return preferredFallbackId ?? orderedEntities[0]?.instanceId;
  }, [orderedEntities, userSelectedId, preferredFallbackId]);
}
