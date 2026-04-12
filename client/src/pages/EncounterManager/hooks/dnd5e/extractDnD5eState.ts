import { DnD5eEncounter, DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";

/**
 * Extract state portion from a full DnD5e encounter
 * 
 */
export function extractDnD5eState(encounter: DnD5eEncounter): DnD5eEncounterState {
  return {
    id: encounter.id,
    system: encounter.system,
    version: encounter.version,
    currentRound: encounter.currentRound,
    currentTurn: encounter.currentTurn,
    initiativeOrder: encounter.initiativeOrder,
    // Extract state from full entities
    entityStates: encounter.entities.map(entity => ({
      instanceId: entity.instanceId,
      templateId: entity.templateId,
      initiative: entity.initiative,
      currentHp: entity.currentHp,
      maxHp: entity.maxHp,
      tempHp: entity.tempHp,
      isConcentrating: entity.isConcentrating,
      deathSaveSuccesses: entity.deathSaveSuccesses,
      deathSaveFailures: entity.deathSaveFailures,
      reactionUsed: entity.reactionUsed,
      conditions: entity.conditions,
    })),
  };
}
