import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import type { DnD5eEntityState } from "shared/domain/encounters/dnd5e/entity.js";
import type { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { resolveEncounterSettings } from "shared/domain/encounters/dnd5e/settings.js";
import type { EncounterRequest } from "shared/sockets/encounters/types.js";
import type { EntityCombatProfile } from "src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";
import type { UserDB } from "src/api/users/types.js";

export function encounterUser(isGm = true): UserDB {
  return {
    id: isGm ? 1 : 2,
    username: isGm ? "GM" : "Player",
    password_hash: "",
    email: "",
    is_gm: isGm,
    last_login: "",
    created_at: "",
  };
}

export function combatProfile(id: number, overrides: Partial<Omit<EntityCombatProfile, "id">> = {}): EntityCombatProfile {
  return {
    id,
    name: `Template ${id}`,
    hp: 10,
    currentHp: null,
    role: "creature",
    settings: {},
    controllerUserIds: [],
    ...overrides,
  };
}

export function encounterEntity(instanceId: number, overrides: Partial<Omit<DnD5eEntityState, "instanceId">> = {}): DnD5eEntityState {
  return {
    instanceId,
    templateId: 100 + instanceId,
    displayName: `Template ${100 + instanceId}`,
    initiative: 20 - instanceId,
    currentHp: 10,
    maxHp: 10,
    tempHp: 0,
    inGrave: false,
    hidden: false,
    isConcentrating: false,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    reactionUsed: false,
    conditions: [],
    ...overrides,
  };
}

export function encounterState(
  entityStates = [encounterEntity(0), encounterEntity(1)],
  options: Partial<Pick<DnD5eEncounterState, "id" | "version" | "phase" | "settings">> = {},
): DnD5eEncounterState {
  const phase = options.phase ?? "running";
  return {
    id: 12,
    system: "dnd5e",
    version: 0,
    settings: resolveEncounterSettings(),
    ...options,
    phase,
    currentRound: phase === "setup" ? 0 : 1,
    currentTurn: 0,
    initiativeOrder: entityStates.filter((entity) => !entity.inGrave).map((entity) => entity.instanceId),
    nextInstanceId: Math.max(-1, ...entityStates.map((entity) => entity.instanceId)) + 1,
    entityStates,
  };
}

export function encounterRequest(
  requestedEvents: DnD5eEncounterEvent[],
  options: Partial<Omit<EncounterRequest, "requestedEvents">> = {},
): EncounterRequest {
  return { encounterId: 12, requestId: crypto.randomUUID(), ...options, requestedEvents };
}

export function damage(targetId: number, amount: number): DnD5eEncounterEvent {
  return { type: "damage", values: { targetId, amount, sourceId: 1 } };
}

export function addEntity(templateId: number): DnD5eEncounterEvent {
  return { type: "addEntity", values: { templateId, name: `Template ${templateId}`, hp: 10 } };
}

export function removeEntity(instanceId: number): DnD5eEncounterEvent {
  return { type: "removeEntity", values: { instanceId } };
}
