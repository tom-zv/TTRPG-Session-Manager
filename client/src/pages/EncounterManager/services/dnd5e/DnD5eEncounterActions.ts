import { QueryClient } from "@tanstack/react-query";
import { DnD5eLocalStateManager } from "./DnD5eLocalStateManager.js";
import { DnD5eHpActions } from "./Actions/HpActions.js";
import { EncounterActions } from "../EncounterActions.js";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eStatActions } from "./Actions/StatActions.js";
import { DnD5eGlobalActions } from "./Actions/GlobalActions.js";
import { DnD5eCombatActions } from "./Actions/CombatActions.js";

/**
 * D&D 5e specific encounter actions
 */
export class DnD5eEncounterActions extends EncounterActions<
  DnD5eEncounterState,
  DnD5eEncounterEvent
> {
  public readonly hp: DnD5eHpActions;
  public readonly stats: DnD5eStatActions;
  public readonly global: DnD5eGlobalActions;
  public readonly combat: DnD5eCombatActions;
  
  constructor(
    stateManager: DnD5eLocalStateManager,
    encounterId: number,
    transmit: (event: DnD5eEncounterEvent) => Promise<void>
  ) {
    super(stateManager, encounterId, transmit);

    // The session reports a rejected event to the user; the result only says whether it applied.
    const sendEvent = (event: DnD5eEncounterEvent): Promise<boolean> =>
      this.dispatch(event).then(() => true, (error: unknown) => {
        console.error("Failed to dispatch encounter event", error);
        return false;
      });
    // Most UI handlers fire and forget.
    const emitEvent = (event: DnD5eEncounterEvent): void => {
      void sendEvent(event);
    };

    this.hp = new DnD5eHpActions(sendEvent);
    this.stats = new DnD5eStatActions(emitEvent);
    this.global = new DnD5eGlobalActions(emitEvent);
    this.combat = new DnD5eCombatActions(emitEvent);
  }


  /**
   * Factory method for instantiation
   */
  static create(
    queryClient: QueryClient,
    encounterId: number,
    transmit: (event: DnD5eEncounterEvent) => Promise<void>
  ): DnD5eEncounterActions {
    const stateManager = new DnD5eLocalStateManager(queryClient);
    return new DnD5eEncounterActions(stateManager, encounterId, transmit);
  }
}
