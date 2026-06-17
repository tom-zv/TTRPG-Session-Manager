import { useCallback, useEffect, useRef, useState } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  EncounterSocketService,
  EncounterDataCallbacks,
  EncounterRoomRequest,
} from "src/services/SocketService/namespaces/encounters.js";
import { EncounterOperation, EncounterRequest } from "shared/sockets/encounters/types.js";
import {
  EncounterBySystem,
  EncounterStateBySystem,
  SystemType,
} from "shared/domain/encounters/coreEncounter.js";
import { EncounterSocketEvents } from "shared/sockets/encounters/socketEvents.js";
import { EncounterError } from "shared/sockets/encounters/errors.js";
import { EncounterActions } from "../services/EncounterActions.js";
import type { QueryKeyProvider } from "../services/LocalStateManager.js";
import { LiveOperationQueue } from "../services/LiveOperationQueue.js";

const COMMAND_ERROR_DISPLAY_MS = 6000;

export interface LiveEncounterConfig<
  T extends SystemType,
  TEncounter extends EncounterBySystem<T>,
  TState extends EncounterStateBySystem<T>,
  TEvent,
  TActions extends EncounterActions<TState, TEvent>
> {
  system: T;
  refreshTemplates?: (queryClient: QueryClient, encounterId: number, templateId?: number) => Promise<void>;
  queryKeys: QueryKeyProvider;
  useComposedEncounter: (encounterId: number) => {
    encounter: TEncounter | null;
    isLoading: boolean;
  };
  createActions: (
    queryClient: QueryClient,
    encounterId: number,
    transmit: (event: TEvent) => Promise<void>
  ) => TActions;
}

/**
 * One session with an encounter, used for preparing it and for running it.
 *
 * The server owns the state. Joining the encounter's socket room returns the current state;
 * after that the cache only changes through the operations the server broadcasts. Every action
 * is sent as a request and shows up when its operation arrives.
 */
export function useGenericLiveEncounter<
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
    createActions,
    queryKeys,
    useComposedEncounter,
    refreshTemplates,
  } = config;

  const { encounter, isLoading } = useComposedEncounter(encounterId);
  // Connection problems (join failed, sync failed) stay until the session recovers.
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  // A rejected action says nothing about the connection, so it is reported separately and fades.
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isLifecycleReady, setIsLifecycleReady] = useState(false);
  // The encounter was deleted while this session was open.
  const [encounterEnded, setEncounterEnded] = useState(false);
  const [actions, setActions] = useState<TActions | null>(null);
  const [lastOperation, setLastOperation] = useState<EncounterOperation<TEvent> | null>(null);

  const actionsRef = useRef<TActions | null>(null);
  const actionsEncounterIdRef = useRef<number | null>(null);
  const socketServiceRef = useRef<EncounterSocketService<TEvent> | null>(null);
  const lifecycleSessionRef = useRef<symbol | null>(null);
  const isLifecycleReadyRef = useRef(false);

  const transmitEvent = useCallback(
    async (event: TEvent): Promise<void> => {
      const socketService = socketServiceRef.current;
      if (!socketService || !isLifecycleReadyRef.current) {
        const error = "Not connected to the encounter";
        setLifecycleError(error);
        throw new Error(error);
      }

      const requestId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const request: EncounterRequest<TEvent> = {
        encounterId,
        requestId,
        baseVersion: queryClient.getQueryData<{ encounterState: TState }>(queryKeys.state(encounterId))?.encounterState.version,
        createdAt: new Date().toISOString(),
        requestedEvents: [event],
      };

      const ack = await socketService.sendMessage(EncounterSocketEvents.REQUEST, request);

      if (!ack.success) {
        setCommandError(ack.error);
        throw new Error(ack.error);
      }

      setCommandError(null);
    },
    [encounterId, queryClient, queryKeys]
  );

  useEffect(() => {
    if (!commandError) return;
    const timer = setTimeout(() => setCommandError(null), COMMAND_ERROR_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [commandError]);

  useEffect(() => {
    const nextActions = createActions(queryClient, encounterId, transmitEvent);
    actionsRef.current = nextActions;
    actionsEncounterIdRef.current = encounterId;
    setActions(nextActions);

    return () => {
      if (actionsRef.current === nextActions) {
        actionsRef.current = null;
        actionsEncounterIdRef.current = null;
      }
    };
  }, [createActions, encounterId, queryClient, transmitEvent]);

  useEffect(() => {
    const sessionId = Symbol("live-encounter-session");
    lifecycleSessionRef.current = sessionId;

    const isCurrentSession = () => lifecycleSessionRef.current === sessionId;
    const stateKey = queryKeys.state(encounterId);
    const getState = () => queryClient.getQueryData<{ encounterState: TState }>(stateKey)?.encounterState;

    /**
     * Join (or re-join) the encounter and replace the cached state with the server's.
     * The server's state always wins, also when the cache holds a higher version: that can only
     * mean the server lost changes, and the cache would otherwise never agree with it again.
     */
    const syncFromServer = async (): Promise<void> => {
      const socketService = socketServiceRef.current;
      if (!socketService || !isCurrentSession()) return;

      const joinAck = await socketService.join<TState>(encounterId);
      if (!isCurrentSession()) return;
      if (!joinAck.success) throw new Error(joinAck.error);

      queryClient.setQueryData<{ encounterState: TState }>(stateKey, { encounterState: joinAck.encounterState });
    };

    const operationQueue = new LiveOperationQueue<TEvent>({
      getVersion: () => getState()?.version,
      isReady: () => isCurrentSession() && isLifecycleReadyRef.current,
      apply: (operation) => {
        const phaseBefore = getState()?.phase;
        actionsRef.current?.applyOperation(operation.appliedEvents, operation.version);
        setLastOperation(operation);
        // The encounter list shows a status derived from the phase.
        if (getState()?.phase !== phaseBefore) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.summaries() });
        }
      },
      resync: syncFromServer,
      onError: (error) => {
        if (isCurrentSession()) setLifecycleError(error instanceof Error ? error.message : "Failed to synchronize encounter");
      },
    });

    const applyOperation = (operation: EncounterOperation<TEvent>) => {
      if (isCurrentSession() && operation.encounterId === encounterId) operationQueue.receive(operation);
    };

    const handleError = (error: EncounterError) => {
      // An error tied to a request is also delivered through that request's acknowledgement.
      if (isCurrentSession() && !error.requestId) {
        setLifecycleError(error.message);
      }
    };

    const handleEncounterEnd = (payload: EncounterRoomRequest) => {
      if (isCurrentSession() && payload.encounterId === encounterId) {
        isLifecycleReadyRef.current = false;
        setIsLifecycleReady(false);
        setEncounterEnded(true);
      }
    };

    const markDisconnected = () => {
      if (isCurrentSession()) {
        isLifecycleReadyRef.current = false;
        setIsLifecycleReady(false);
      }
    };

    const connectToEncounter = async () => {
      if (!socketServiceRef.current || !isCurrentSession()) {
        return;
      }

      try {
        setLifecycleError(null);
        setCommandError(null);
        setLastOperation(null);
        setEncounterEnded(false);
        setIsLifecycleReady(false);
        isLifecycleReadyRef.current = false;

        await syncFromServer();
        if (!isCurrentSession()) return;

        await refreshTemplates?.(queryClient, encounterId);
        if (!isCurrentSession()) return;

        isLifecycleReadyRef.current = true;
        setIsLifecycleReady(true);
        operationQueue.flush();
      } catch (error) {
        if (isCurrentSession()) {
          isLifecycleReadyRef.current = false;
          setIsLifecycleReady(false);
          setLifecycleError(
            error instanceof Error ? error.message : "Failed to connect to the encounter"
          );
        }
      }
    };

    const dataCallbacks: EncounterDataCallbacks<TEvent> = {
      onTemplateUpdated: ({ templateId }) => {
        void refreshTemplates?.(queryClient, encounterId, templateId).catch((error) => {
          if (isCurrentSession()) setLifecycleError(error instanceof Error ? error.message : "Failed to refresh NPC settings");
        });
      },
      applyOperation,
      onError: handleError,
      onEncounterEnd: handleEncounterEnd,
      onDisconnect: markDisconnected,
      onReconnect: () => {
        if (isCurrentSession()) {
          void connectToEncounter();
        }
      },
    };
    const socketService = new EncounterSocketService<TEvent>(dataCallbacks);
    socketServiceRef.current = socketService;

    void connectToEncounter();

    return () => {
      operationQueue.dispose();
      if (isCurrentSession()) {
        lifecycleSessionRef.current = null;
      }

      isLifecycleReadyRef.current = false;
      if (socketServiceRef.current === socketService) {
        socketServiceRef.current = null;
      }

      void socketService.sendMessage(EncounterSocketEvents.LEAVE, { encounterId });
      socketService.dispose();
      // Without a session nothing keeps the cached state current, so it must not be shown again.
      queryClient.removeQueries({ queryKey: stateKey, exact: true });
    };
  }, [encounterId, queryClient, queryKeys, refreshTemplates]);

  const currentActions = actionsEncounterIdRef.current === encounterId
    ? actions
    : null;

  return {
    encounter,
    isLoading,
    isLifecycleReady,
    lifecycleError,
    commandError,
    encounterEnded,
    lastOperation,
    actions: currentActions,
  };
}
