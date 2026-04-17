import { useState, useEffect, useCallback, useRef } from "react";
import {
  EncounterSocketService,
  EncounterDataCallbacks,
  EncounterRoomRequest,
} from "src/services/SocketService/namespaces/encounters.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";
import { AnySystemEncounterState, EncounterBySystem, EncounterStateBySystem, SystemType } from "shared/domain/encounters/coreEncounter.js";
import { EncounterActions } from "../services/EncounterActions.js";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { DnD5eEncounter, DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEncounterActions } from "../services/dnd5e/DnD5eEncounterActions.js";
import { useComposedDnD5eEncounter } from "./dnd5e/useComposedDnD5eEncounter.js";
import { EncounterMessages } from "shared/sockets/encounters/messages.js";
import { EncounterError } from "shared/sockets/encounters/errors.js";

export interface QueryKeyProvider {
  state(encounterId: number, snapshotType?: string): readonly unknown[];
}

export type LiveEncounterOptions = {
  isGm: boolean;
};

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
  createActions: (
    queryClient: QueryClient,
    encounterId: number,
    transmit?: (event: TEvent) => Promise<void>
  ) => TActions;
}

function useGenericLiveEncounter<
  T extends SystemType,
  TEncounter extends EncounterBySystem<T>,
  TState extends EncounterStateBySystem<T>,
  TEvent,
  TActions extends EncounterActions<TState, TEvent>
>(
  encounterId: number,
  options: LiveEncounterOptions,
  config: LiveEncounterConfig<T, TEncounter, TState, TEvent, TActions>
) {

  const queryClient = useQueryClient();
  const {
    useComposedEncounter,
    createActions,
  } = config;
  const { isGm } = options;

  const { encounter, isLoading } = useComposedEncounter(encounterId);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [isLifecycleReady, setIsLifecycleReady] = useState(false);
  const [encounterEnded, setEncounterEnded] = useState(false);

  // TODO: Use snapshotType to prompt user if active snapshot was loaded
  
  const actionsRef = useRef<TActions>();

  const dataCallbacks: EncounterDataCallbacks = {
    applyOperation: useCallback((operation: EncounterOperation) => {
      for (const event of operation.appliedEvents) {
        actionsRef.current?.applyEvent(event as TEvent);
      }
    }, []),
    onError: useCallback((error: EncounterError) => {
      setLifecycleError(error.message);
    }, []),
    onEncounterEnd: useCallback((payload: EncounterRoomRequest) => {
      if (payload.encounterId === encounterId) {
        setEncounterEnded(true);
      }
    }, [encounterId]),

  };

  const [socketService] = useState(
    () => new EncounterSocketService(dataCallbacks)
  );

  const transmitEvent = useCallback(
    async (event: TEvent): Promise<void> => {
      const requestId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const ack = await socketService.sendMessage(EncounterMessages.REQUEST, {
        encounterId,
        requestId,
        createdAt: new Date().toISOString(),
        requestedEvents: [event as unknown as DnD5eEncounterEvent],
      });

      if (!ack.success) {
        setLifecycleError(ack.error);
        throw new Error(ack.error);
      }
    },
    [socketService, encounterId]
  );

  // Initialize actions
  if (!actionsRef.current){
    actionsRef.current = createActions(queryClient, encounterId, transmitEvent);
  }

  useEffect(() => {
    let isMounted = true;

    const connectToEncounter = async () => {
      try {
        setLifecycleError(null);
        setEncounterEnded(false);
        setIsLifecycleReady(false);

        if (isGm) {
          const initAck = await socketService.sendMessage(EncounterMessages.INIT, {
            encounterId,
            system: config.system,
          });

          if (!initAck.success) {
            if (isMounted) {
              setLifecycleError(initAck.error);
            }
            return;
          }
        }

        const joinAck = await socketService.sendMessage(EncounterMessages.JOIN, {
          encounterId,
        });

        if (!joinAck.success) {
          if (isMounted) {
            setLifecycleError(joinAck.error);
          }
          return;
        }

        if (isMounted) {
          setIsLifecycleReady(true);
        }
      } catch (error) {
        if (isMounted) {
          setLifecycleError(
            error instanceof Error ? error.message : "Failed to connect live encounter"
          );
        }
      }
    };

    void connectToEncounter();

    return () => {
      isMounted = false;
      void socketService.sendMessage(EncounterMessages.LEAVE, { encounterId });
    };
  }, [socketService, encounterId, isGm, config.system]);

  return { 
    encounter,
    isLoading,
    isLifecycleReady,
    lifecycleError,
    encounterEnded,
    socketService,
    actions: actionsRef.current as TActions,
  };
}

/**
 * System specific live encounter hook
 *
 */
export const useLiveEncounter = (
  system: SystemType,
  encounterId: number,
  options: LiveEncounterOptions
) => {
  switch (system) {
    case "dnd5e":
      return useGenericLiveEncounter<
        "dnd5e",
        DnD5eEncounter,
        DnD5eEncounterState,
        DnD5eEncounterEvent,
        DnD5eEncounterActions
      >(encounterId, options, {
        system: "dnd5e",
        useComposedEncounter: useComposedDnD5eEncounter,
        createActions: DnD5eEncounterActions.create,
      });

    default:
      throw new Error(`Unsupported system type: ${system}`);
  }
};
