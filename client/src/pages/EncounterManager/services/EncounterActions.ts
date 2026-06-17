import { LocalStateManager } from "./LocalStateManager.js";

/**
 * Base class for encounter actions
 * Each game system should extend this with their specific action modules
 * 
 * @template TState - The encounter state type for this system
 * @template TEvent - The event type for this system
 */
export abstract class EncounterActions<TState extends { version: number }, TEvent> {
  constructor(
    protected stateManager: LocalStateManager<TState, TEvent>,
    protected encounterId: number,
    protected transmit: (event: TEvent) => Promise<void>
  ) {}

  /**
   * Apply a server-confirmed operation to the encounter state.
   */
  applyOperation(events: TEvent[], version: number): void {
    this.stateManager.applyOperation(this.encounterId, events, version);
  }

  /**
   * Send an event to the server. The change shows up when the server broadcasts the
   * resulting operation; a rejected event rejects the promise.
   */
  async dispatch(event: TEvent): Promise<void> {
    await this.transmit(event);
  }
}
