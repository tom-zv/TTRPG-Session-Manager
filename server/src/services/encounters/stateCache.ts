import { BaseEncounterState } from "shared/domain/encounters/coreEncounter.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";

export interface IStateCache<TState extends BaseEncounterState> {
  logOperation(operation: EncounterOperation): void;
  shouldSnapshot(version: number): boolean;
  addSnapshot(state: TState): void;
}

/**
 * Response data for client state synchronization
 * - state: Full state snapshot (sent when client needs it)
 * - operations: Operation stream since client's last version
 */
export interface StateData<TState extends BaseEncounterState> {
  state?: TState;
  operations: EncounterOperation[];
}

export abstract class BaseStateCache<TState extends BaseEncounterState>
  implements IStateCache<TState>
{
  protected operationLog: EncounterOperation[] = [];
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

  logOperation(operation: EncounterOperation): void {
    this.operationLog.push(structuredClone(operation));
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
   * @returns State snapshot + operations, or just operations if client has recent snapshot
   */
  getLatestState(clientVersion: number = 0): StateData<TState> {
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];

    if (clientVersion < latestSnapshot.version) {
      const operationsSinceSnapshot = this.operationLog.filter(
        (operation) => operation.version > latestSnapshot.version,
      );

      return {
        state: structuredClone(latestSnapshot),
        operations: structuredClone(operationsSinceSnapshot),
      };
    }

    const operationsSinceClient = this.operationLog.filter(
      (operation) => operation.version > clientVersion,
    );

    return {
      operations: structuredClone(operationsSinceClient),
    };
  }
}
