import type { CoreEncounter } from "shared/domain/encounters/coreEncounter.js";
import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import type { SqlExecutor } from "src/db.js";
import { DnD5eEncounterEngine, type CarriedHp } from "src/services/encounters/dnd5e/dnd5eEncounterEngine.js";
import type { CombatProfileLoader } from "src/services/encounters/dnd5e/dnd5eRequestHandler.js";
import { combatProfile, encounterState } from "../fixtures/encounters.js";

export class RecordingEncounterEngine extends DnD5eEncounterEngine {
  readonly snapshots: DnD5eEncounterState[] = [];
  readonly memberships: Map<number, number>[] = [];
  readonly statuses: CoreEncounter["status"][] = [];
  readonly carriedHp: CarriedHp[][] = [];
  /** Selection changes in commit order: what a start or reset asked of the campaign's current encounter. */
  readonly selections: Array<"select" | "clearIfCurrent"> = [];
  /** Writes inside the start/reset transaction, rolled back with it. */
  readonly transactions: Array<"committed" | "rolledBack"> = [];
  selectionSaveError?: Error;

  beforeSnapshotSave?: (snapshot: DnD5eEncounterState) => Promise<void>;
  membershipSaveError?: Error;
  statusSaveError?: Error;
  carriedHpSaveError?: Error;

  constructor(
    initialState = encounterState(),
    loadProfiles: CombatProfileLoader = async (ids) => ids.map((id) => combatProfile(id)),
  ) {
    super(initialState, loadProfiles);
  }

  protected override async persistSnapshot(state: DnD5eEncounterState): Promise<void> {
    const snapshot = structuredClone(state);
    await this.beforeSnapshotSave?.(snapshot);
    this.snapshots.push(snapshot);
  }

  protected override async persistMembership(state: DnD5eEncounterState): Promise<void> {
    if (this.membershipSaveError) throw this.membershipSaveError;
    this.memberships.push(new Map(this.entityCopies(state)));
  }

  /** No database: snapshot and selection writes run in order and the outcome is recorded. */
  protected override async inTransaction<T>(task: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    const snapshotCount = this.snapshots.length;
    const membershipCount = this.memberships.length;
    const transaction: SqlExecutor = {
      execute: () => Promise.reject(new Error("RecordingEncounterEngine has no database")),
    } as unknown as SqlExecutor;
    try {
      const result = await task(transaction);
      this.transactions.push("committed");
      return result;
    } catch (error) {
      this.snapshots.length = snapshotCount;
      this.memberships.length = membershipCount;
      this.transactions.push("rolledBack");
      throw error;
    }
  }

  protected override async persistSelection(change: "select" | "clearIfCurrent"): Promise<number | null> {
    if (this.selectionSaveError) throw this.selectionSaveError;
    this.selections.push(change);
    return 1;
  }

  protected override async persistStatus(status: CoreEncounter["status"]): Promise<void> {
    if (this.statusSaveError) throw this.statusSaveError;
    this.statuses.push(status);
  }

  protected override async persistCarriedHp(carried: CarriedHp[]): Promise<void> {
    if (this.carriedHpSaveError) throw this.carriedHpSaveError;
    this.carriedHp.push(structuredClone(carried));
  }
}
