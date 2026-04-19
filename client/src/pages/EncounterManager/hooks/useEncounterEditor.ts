import { useEffect, useCallback, useRef, useState } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { SyncState } from "src/services/EditorSync/syncConfig.js";
import { SystemType, EncounterBySystem, AnySystemEncounterState } from "shared/domain/encounters/coreEncounter.js";
import { EncounterActions } from "../services/EncounterActions.js";
import { 
  DnD5eEncounter,
  DnD5eEncounterState 
} from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import DnD5eEncounterApi from "../api/dnd5e/encounters/dnd5eEncounterApi.js";
import { DnD5eEncounterActions } from "../services/dnd5e/DnD5eEncounterActions.js";
import { useComposedDnD5eEncounter } from "./dnd5e/index.js";

/**
 * Configuration for system-specific encounter editor behavior
 * Note: Actions work with State types, but the hook composes and returns full Encounter types
 */
export interface EncounterEditorConfig<
  T extends SystemType,
  TEncounter extends EncounterBySystem<T>,
  TState extends AnySystemEncounterState,
  TEvent,
  TActions extends EncounterActions<TState, TEvent>
> {
  /** The game system type */
  system: T;
  /** Hook to compose the full encounter from normalized caches */
  useComposedEncounter: (encounterId: number) => {
    encounter: TEncounter | null;
    isLoading: boolean;
  };
  /** Function to save encounter state to the server */
  saveState: (encounterId: number, state: TState) => Promise<void>;
  /** Factory function to create system-specific actions */
  createActions: (queryClient: QueryClient, encounterId: number) => TActions;
}

/**
 * Generic hook for managing encounter state in the Editor
 * 
 * Key features:
 * - Composes encounter from normalized caches (details, state, entities)
 * - Periodic sync of local edits to backend (handled by LocalStateManager)
 * - Optimistic updates for immediate UI feedback
 * - System-agnostic implementation
 * 
 * Note: Actions operate on State types, but the hook exposes full Encounter types for convenience
 * 
 * @template T - The system type ('dnd5e', etc.)
 * @template TEncounter - The full encounter type (details + state + entities)
 * @template TState - The state-only type (for actions and saving)
 * @template TEvent - The event type for this system
 * @template TActions - The actions type for this system (operates on TState)
 */
function useGenericEncounterEditor<
  T extends SystemType,
  TEncounter extends EncounterBySystem<T>,
  TState extends AnySystemEncounterState,
  TEvent,
  TActions extends EncounterActions<TState, TEvent>
>(encounterId: number, config: EncounterEditorConfig<T, TEncounter, TState, TEvent, TActions>) {
  const queryClient = useQueryClient();
  const {
    useComposedEncounter,
    saveState,
    createActions,
  } = config;
  const { encounter, isLoading } = useComposedEncounter(encounterId);

  const [syncState, setSyncState] = useState<SyncState | null>(null);
  
  const actionsRef = useRef<TActions>();
  const syncInitializedRef = useRef(false);

  // Initialize actions
  if (!actionsRef.current) {
    actionsRef.current = createActions(queryClient, encounterId);
  }

  // Initialize sync when encounter is loaded
  useEffect(() => {
    if (actionsRef.current && !syncInitializedRef.current) {
      const stateManager = actionsRef.current.getStateManager();
      stateManager.initializeSync(encounterId, saveState, setSyncState);
      syncInitializedRef.current = true;
    }
  }, [encounterId, saveState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const cleanup = async () => {
        await actionsRef.current?.destroy();
        syncInitializedRef.current = false;
      };
      cleanup();
    };
  }, []);

  /**
   * Force an immediate sync
   */
  const forceSyncNow = useCallback(async (): Promise<boolean> => {
    if (actionsRef.current) {
      return await actionsRef.current.forceSyncNow();
    }
    return false;
  }, []);

  return {
    encounter,
    isLoading,
    syncState,
    actions: actionsRef.current,
    forceSyncNow,
  };
}

/**
 * System specific encounter editor hook
 * 
 * This is where system-specific implementations are wired together:
 * - Composition hooks (how to build full encounter from caches)
 * - Save functions (how to persist state)
 * - Actions (how to modify state)
 */
export const useEncounterEditor = (encounterId: number, system: SystemType) => {
  switch (system) {
    case "dnd5e":
      return useGenericEncounterEditor<
        "dnd5e",
        DnD5eEncounter,
        DnD5eEncounterState,
        DnD5eEncounterEvent,
        DnD5eEncounterActions
      >(encounterId, {
        system: "dnd5e",
        useComposedEncounter: useComposedDnD5eEncounter,
        saveState: (encounterId, state) => 
          DnD5eEncounterApi.saveEncounterState(encounterId, state),
        createActions: DnD5eEncounterActions.create,
      });
      
    default:
      throw new Error(`Unsupported system type: ${system}`);
  }
};
