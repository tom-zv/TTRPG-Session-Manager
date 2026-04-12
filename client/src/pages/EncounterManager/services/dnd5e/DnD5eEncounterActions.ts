import { QueryClient } from "@tanstack/react-query";
import { DnD5eLocalStateManager } from "./DnD5eLocalStateManager.js";
import { DnD5eHpActions } from "./Actions/HpActions.js";
import { EncounterActions } from "../EncounterActions.js";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eStatActions } from "./Actions/StatActions.js";
import { DnD5eGlobalActions } from "./Actions/GlobalActions.js";

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
  
  constructor(
    stateManager: DnD5eLocalStateManager,
    encounterId: number,

  ) {
    super(stateManager, encounterId);
    this.hp = new DnD5eHpActions(stateManager, encounterId);
    this.stats = new DnD5eStatActions(stateManager, encounterId);
    this.global = new DnD5eGlobalActions(stateManager, encounterId);
  }


  /**
   * Factory method for instantiation
   */
  static create(queryClient: QueryClient, encounterId: number): DnD5eEncounterActions {
    const stateManager = new DnD5eLocalStateManager(queryClient);
    return new DnD5eEncounterActions(stateManager, encounterId);
  }
}