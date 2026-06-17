import { QueryClient } from "@tanstack/react-query";
import { produce } from "immer";

/**
 * Generic interface for event processors
 */
export interface EventProcessor<TState, TEvent> {
  applyEvent(state: TState, event: TEvent): void;
}

/**
 * Query key generator for encounter data
 */
export interface QueryKeyProvider {
  state(encounterId: number, ...args: unknown[]): readonly unknown[];
  summaries(): readonly unknown[];
}

/**
 * Keeps the cached encounter state in step with the server.
 * The server is the only writer: the cache is replaced when the client joins and advanced by
 * the operations the server broadcasts. Nothing is applied locally ahead of the server.
 *
 * @template TState - The encounter state type for this system
 * @template TEvent - The event type for this system
 */
export class LocalStateManager<TState extends { version: number }, TEvent> {
  constructor(
    private queryClient: QueryClient,
    private eventProcessor: EventProcessor<TState, TEvent>,
    private queryKeys: QueryKeyProvider
  ) {}

  /**
   * Apply a server operation in a single cache update.
   * An operation that is not newer than the cached state is ignored.
   */
  applyOperation(encounterId: number, events: TEvent[], version: number) {
    this.queryClient.setQueryData<{ encounterState: TState }>(
      this.queryKeys.state(encounterId),
      (old) => {
        if (!old || version <= old.encounterState.version) return old;
        const encounterState = produce(old.encounterState, (draft) => {
          for (const event of events) {
            this.eventProcessor.applyEvent(draft as TState, event);
          }
          (draft as TState).version = version;
        });
        return { ...old, encounterState };
      }
    );
  }
}
