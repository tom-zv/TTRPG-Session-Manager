import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import type { DnD5eEntityState } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { type ActingContext, type HpDisplay, mayAdjustHp, mayRunEntity, maySetHpValues } from "shared/domain/encounters/dnd5e/view.js";
import { EncounterAuthorizationError } from "../EncounterAuthorizationError.js";

/**
 * The table policy of `shared/domain/encounters/dnd5e/view.ts`, applied to the state the request
 * executes against. Whether this is the campaign's current encounter is checked by the socket
 * request handler and again in the write transaction.
 */
export type DnD5eAuthContext = {
  state: DnD5eEncounterState;
  isGm: boolean;
  /** Whether the user controls this entity instance. Always true for a GM. */
  controls: (instanceId: number) => boolean;
  /** How much of this entity instance's HP the user is shown. Always exact for a GM. */
  hpDisplay: (instanceId: number) => HpDisplay;
};

type DnD5eEventAuthRule<K extends DnD5eEncounterEvent["type"]> = (
  context: DnD5eAuthContext,
  event: Extract<DnD5eEncounterEvent, { type: K }>,
) => boolean;

type DnD5eEventAuthRuleMap = {
  [K in DnD5eEncounterEvent["type"]]: DnD5eEventAuthRule<K>;
};

type TargetedEvent = Extract<DnD5eEncounterEvent, { values: { targetId: number } }>;

const actingContext = (context: DnD5eAuthContext): ActingContext<DnD5eEntityState> => ({
  isGm: context.isGm,
  running: context.state.phase === "running",
  controls: (entity) => context.controls(entity.instanceId),
  hpDisplay: (entity) => context.hpDisplay(entity.instanceId),
});

const findTarget = (context: DnD5eAuthContext, event: TargetedEvent): DnD5eEntityState | undefined =>
  context.state.entityStates.find((entity) => entity.instanceId === event.values.targetId);

/** Shaping the encounter: membership, phases, turns, settings, the grave, maximum HP. */
const gmOnly = (context: DnD5eAuthContext): boolean => context.isGm;

/** Damage and healing: any target in play, for a player with a combatant of their own in play. */
const adjustsHp = (context: DnD5eAuthContext, event: TargetedEvent): boolean => {
  if (context.isGm) return true;
  const target = findTarget(context, event);
  return target !== undefined && mayAdjustHp(actingContext(context), context.state.entityStates, target);
};

/** Initiative: their own entities in play. */
const runsTarget = (context: DnD5eAuthContext, event: TargetedEvent): boolean => {
  if (context.isGm) return true;
  const target = findTarget(context, event);
  return target !== undefined && mayRunEntity(actingContext(context), target);
};

/** Temporary HP and death saves: their own entities in play, with exact HP. */
const setsHpValues = (context: DnD5eAuthContext, event: TargetedEvent): boolean => {
  if (context.isGm) return true;
  const target = findTarget(context, event);
  return target !== undefined && maySetHpValues(actingContext(context), target);
};

/**
 * Current HP: as `setsHpValues`, and a player stays within the maximum. The reducer raises the
 * maximum to an above-maximum value, and maximum HP is the GM's.
 */
const setsCurrentHp = (
  context: DnD5eAuthContext,
  event: Extract<DnD5eEncounterEvent, { type: "setCurrentHp" }>,
): boolean => {
  if (context.isGm) return true;
  const target = findTarget(context, event);
  return target !== undefined && maySetHpValues(actingContext(context), target) && event.values.hp <= target.maxHp;
};

const DND5E_EVENT_AUTH_RULES = {
  addEntity: gmOnly,
  removeEntity: gmOnly,
  startCombat: gmOnly,
  endCombat: gmOnly,
  resetEncounter: gmOnly,
  updateEncounterSettings: gmOnly,
  moveToGrave: gmOnly,
  restoreFromGrave: gmOnly,
  setHp: gmOnly,
  setHidden: gmOnly,
  nextTurn: gmOnly,

  damage: adjustsHp,
  heal: adjustsHp,

  setCurrentHp: setsCurrentHp,
  setTempHp: setsHpValues,
  setInitiative: runsTarget,
  setDeathSaves: setsHpValues,
} satisfies DnD5eEventAuthRuleMap;

export function authorizeDnD5eEvent(context: DnD5eAuthContext, event: DnD5eEncounterEvent): void {
  const rule = DND5E_EVENT_AUTH_RULES[event.type] as (
    ctx: DnD5eAuthContext,
    ev: DnD5eEncounterEvent,
  ) => boolean;

  if (!rule(context, event)) {
    throw new EncounterAuthorizationError(`Not authorized to perform event: ${event.type}`);
  }
}
