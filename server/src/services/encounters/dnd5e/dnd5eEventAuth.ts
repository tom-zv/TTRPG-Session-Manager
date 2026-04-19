import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { encounterEvent } from "shared/sockets/encounters/types.js";
import { UserDB } from "src/api/users/types.js";
import { IEventAuthorizer } from "../requestHandler.js";
import { EncounterAuthorizationError } from "../EncounterAuthorizationError.js";

type DnD5eAuthContext = {
  state: DnD5eEncounterState;
  user: UserDB;
};

type DnD5eEventAuthRule<K extends DnD5eEncounterEvent["type"]> = (
  context: DnD5eAuthContext,
  event: Extract<DnD5eEncounterEvent, { type: K }>,
) => boolean;

type DnD5eEventAuthRuleMap = {
  [K in DnD5eEncounterEvent["type"]]: DnD5eEventAuthRule<K>;
};

const isGm = (context: DnD5eAuthContext): boolean => context.user.is_gm;

const authorizeGmOnly = (context: DnD5eAuthContext): boolean => isGm(context);

// Placeholder: replace with ownership/controller checks when state includes that metadata.
const authorizeEntityOwnership = (
  context: DnD5eAuthContext,
  _event: Extract<DnD5eEncounterEvent, { values: { targetId: number } }>,
): boolean => {
  if (isGm(context)) {
    return true;
  }

  return true;
};

// Placeholder: replace with turn-controller checks when state includes ownership/controller data.
const authorizeTurnControl = (context: DnD5eAuthContext): boolean => {
  if (isGm(context)) {
    return true;
  }

  return true;
};

// Events that require no auth checks.
const authorizeUnrestricted = (): boolean => true;

const DND5E_EVENT_AUTH_RULES = {
  addEntity: (context) => authorizeGmOnly(context),
  removeEntity: (context) => authorizeGmOnly(context),
  resetEncounter: (context) => authorizeGmOnly(context),

  nextTurn: (context) => authorizeTurnControl(context),
  
  damage: () => authorizeUnrestricted(),
  heal: () => authorizeUnrestricted(),
  setHp: () => authorizeUnrestricted(),
  setCurrentHp: () => authorizeUnrestricted(),
  setTempHp: () => authorizeUnrestricted(),

  setInitiative: (context, event) => authorizeEntityOwnership(context, event),
} satisfies DnD5eEventAuthRuleMap;

function authorizeEvent(
  context: DnD5eAuthContext,
  event: DnD5eEncounterEvent,
): boolean {
  const rule = DND5E_EVENT_AUTH_RULES[event.type] as (
    ctx: DnD5eAuthContext,
    ev: DnD5eEncounterEvent,
  ) => boolean;

  return rule(context, event);
}

export class DnD5eEventAuthorizer implements IEventAuthorizer {
  protected state: DnD5eEncounterState;

  constructor(state: DnD5eEncounterState) {
    this.state = state;
  }

  authorizeEvents(events: encounterEvent[], user: UserDB): void {
    const context: DnD5eAuthContext = {
      state: this.state,
      user,
    };

    for (const event of events as DnD5eEncounterEvent[]) {
      const authorized = authorizeEvent(context, event);
      if (!authorized) {
        throw new EncounterAuthorizationError(
          `Not authorized to perform event: ${event.type}`,
        );
      }
    }
  }
}
