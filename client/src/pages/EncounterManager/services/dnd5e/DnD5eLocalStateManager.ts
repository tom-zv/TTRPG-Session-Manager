import { QueryClient } from "@tanstack/react-query";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { ENCOUNTER_KEYS } from "../../api/dnd5e/encounters/query/keys.js";
import { DnD5eEventProcessor } from "shared/domain/encounters/dnd5e/events/EventProcessor.js";
import { LocalStateManager } from "../LocalStateManager.js";

/**
 * D&D 5e specific implementation of LocalStateManager
 * Provides the event processor and query keys for D&D 5e encounters
 */
export class DnD5eLocalStateManager extends LocalStateManager<
  DnD5eEncounterState,
  DnD5eEncounterEvent
> {
  constructor(queryClient: QueryClient) {
    super(
      queryClient,
      DnD5eEventProcessor,
      ENCOUNTER_KEYS
    );
  }
}
