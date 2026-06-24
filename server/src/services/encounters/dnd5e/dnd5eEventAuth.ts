import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { EncounterAuthorizationError } from "../EncounterAuthorizationError.js";

export type DnD5eAuthContext = {
  state: DnD5eEncounterState;
  isGm: boolean;
  /** Whether the user controls this entity instance. Always true for a GM. */
  controls: (instanceId: number) => boolean;
};

type DnD5eEventAuthRule<K extends DnD5eEncounterEvent["type"]> = (
  context: DnD5eAuthContext,
  event: Extract<DnD5eEncounterEvent, { type: K }>,
) => boolean;

type DnD5eEventAuthRuleMap = {
  [K in DnD5eEncounterEvent["type"]]: DnD5eEventAuthRule<K>;
};

/** Shaping the encounter: membership, phases, settings, the grave, maximum HP. */
const gmOnly = (context: DnD5eAuthContext): boolean => context.isGm;

/** Running a character: its HP, initiative and death saves. */
const controlsTarget = (
  context: DnD5eAuthContext,
  event: Extract<DnD5eEncounterEvent, { values: { targetId: number } }>,
): boolean => context.controls(event.values.targetId);

/** Ending a turn: the GM, or whoever controls the entity whose turn it is. */
const controlsActiveTurn = (context: DnD5eAuthContext): boolean => {
  if (context.isGm) return true;
  const activeId = context.state.initiativeOrder[context.state.currentTurn];
  return activeId !== undefined && context.controls(activeId);
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

  damage: controlsTarget,
  heal: controlsTarget,
  setCurrentHp: controlsTarget,
  setTempHp: controlsTarget,
  setInitiative: controlsTarget,
  setDeathSaves: controlsTarget,

  nextTurn: controlsActiveTurn,
} satisfies DnD5eEventAuthRuleMap;

export function authorizeDnD5eEvents(context: DnD5eAuthContext, events: DnD5eEncounterEvent[]): void {
  for (const event of events) {
    const rule = DND5E_EVENT_AUTH_RULES[event.type] as (
      ctx: DnD5eAuthContext,
      ev: DnD5eEncounterEvent,
    ) => boolean;

    if (!rule(context, event)) {
      throw new EncounterAuthorizationError(`Not authorized to perform event: ${event.type}`);
    }
  }
}
