import { useState, useEffect, useCallback, useRef } from "react";
import { EncounterSocketService, EncounterDataCallbacks } from "src/services/SocketService/namespaces/encounters.js";
import { EncounterOperationDTO } from "shared/sockets/encounters/types.js"; 
import { AnySystemEncounterState, EncounterBySystem, EncounterStateBySystem, SystemType } from "shared/domain/encounters/coreEncounter.js";
import { EncounterActions } from "../services/EncounterActions.js";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { DnD5eEncounter, DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEncounterActions } from "../services/dnd5e/DnD5eEncounterActions.js";
import { useComposedDnD5eEncounter } from "./dnd5e/useComposedDnD5eEncounter.js";
import { EncounterMessages } from "shared/sockets/encounters/messages.js";

export interface QueryKeyProvider {
  state(encounterId: number, snapshotType?: string): readonly unknown[];
}


export interface LiveEncounterConfig<
  T extends SystemType,
  TEncounter extends EncounterBySystem<T>,
  TState extends AnySystemEncounterState,
  TEvent,
  TActions extends EncounterActions<TState, TEvent>
> {
  system: T;
  useComposedEncounter: (encounterId: number) => {
    encounter: TEncounter | null;
    isLoading: boolean;
  };
  createActions: (queryClient: QueryClient, encounterId: number, ) => TActions;
}

function useGenericLiveEncounter<
  T extends SystemType,
  TEncounter extends EncounterBySystem<T>,
  TState extends EncounterStateBySystem<T>,
  TEvent,
  TActions extends EncounterActions<TState, TEvent>
>(
  encounterId: number,
  config: LiveEncounterConfig<T, TEncounter, TState, TEvent, TActions>
) {

  const queryClient = useQueryClient();
  const {
    useComposedEncounter,
    createActions,
  } = config;

  const { encounter, isLoading } = useComposedEncounter(encounterId);

  // TODO: Use snapshotType to prompt user if active snapshot was loaded
  
  const actionsRef = useRef<TActions>();

  // Initialize actions
  if (!actionsRef.current){
    actionsRef.current = createActions(queryClient, encounterId);
  }

  const dataCallbacks: EncounterDataCallbacks = {
    applyOperation: useCallback((operation: EncounterOperationDTO) => {
      for (const event of operation.appliedEvents) {
        actionsRef.current?.applyEvent(event as TEvent);
      }
    }, []),

  };

  const [socketService] = useState(
    () => new EncounterSocketService(dataCallbacks)
  );

  useEffect(() => {
    return () => {
      socketService.sendMessage(EncounterMessages.LEAVE);
    };
  }, [socketService, encounterId]);

  return { 
    encounter,
    isLoading, 
    socketService, 
    actions: actionsRef.current,
  };
}

/**
 * System specific live encounter hook
 *
 */
export const useLiveEncounter = (system: SystemType, encounterId: number) => {
  switch (system) {
    case "dnd5e":
      return useGenericLiveEncounter<
        "dnd5e",
        DnD5eEncounter,
        DnD5eEncounterState,
        DnD5eEncounterEvent,
        DnD5eEncounterActions
      >(encounterId, {
        system: "dnd5e",
        useComposedEncounter: useComposedDnD5eEncounter,
        createActions: DnD5eEncounterActions.create,
      });

    default:
      throw new Error(`Unsupported system type: ${system}`);
  }
};
