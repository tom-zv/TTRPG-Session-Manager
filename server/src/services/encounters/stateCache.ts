import { EncounterCommand } from "shared/sockets/encounters/commands.js";
import { BaseEncounterState } from "shared/domain/encounters/coreEncounter.js";

export interface VersionedEvent {
  version: number;
}

export interface IStateCache<
  TState extends BaseEncounterState,
  TEvent extends VersionedEvent
> {
  logCommand(command: EncounterCommand): void;
  logEvent(event: TEvent): void;
  shouldSnapshot(version: number): boolean;
  addSnapshot(state: TState): void;
}

/**
 * Response data for client state synchronization
 * - state: Full state snapshot (sent when client needs it)
 * - events: Event stream since client's last version
 */
export interface StateData<
  TState extends BaseEncounterState,
  TEvent extends VersionedEvent
> {
  state?: TState;
  events: TEvent[];
}

export abstract class BaseStateCache<
  TState extends BaseEncounterState,
  TEvent extends VersionedEvent
> implements IStateCache<TState, TEvent>
{
  protected commandLog: EncounterCommand[] = [];
  protected eventLog: TEvent[] = [];
  protected snapshots: TState[] = [];
  protected snapshotInterval: number;

  constructor(
    initial: TState,
    options: {
      snapshotInterval?: number;
    } = {}
  ) {
    this.snapshots.push(structuredClone(initial));
    this.snapshotInterval = options.snapshotInterval ?? 100;
  }

  logCommand(command: EncounterCommand): void {
    this.commandLog.push(structuredClone(command));
  }

  logEvent(event: TEvent): void {
    this.eventLog.push(structuredClone(event));
  }

  shouldSnapshot(version: number): boolean {
    return version % this.snapshotInterval === 0;
  }

  addSnapshot(state: TState): void {
    this.snapshots.push(structuredClone(state));
  }

  /**
   * Get the latest state data for a client
   * @param clientVersion - Client's last known version (0 for new clients)
   * @returns State snapshot + events, or just events if client has recent snapshot
   */
  getLatestState(clientVersion: number = 0): StateData<TState, TEvent> {
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];
    
    // If client's version is older than our latest snapshot, send snapshot + events since 
    if (clientVersion < latestSnapshot.version) {
      const eventsSinceSnapshot = this.eventLog.filter(
        event => event.version > latestSnapshot.version
      );
      
      return {
        state: structuredClone(latestSnapshot),
        events: structuredClone(eventsSinceSnapshot)
      };
    }
    
    // Client has recent snapshot, just send events since their version
    const eventsSinceClient = this.eventLog.filter(
      event => event.version > clientVersion
    );
    
    return {
      events: structuredClone(eventsSinceClient)
    };
  }
}
