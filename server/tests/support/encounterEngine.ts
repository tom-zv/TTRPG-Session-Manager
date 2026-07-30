import type { CoreEncounter } from "shared/domain/encounters/coreEncounter.js";
import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEngine, type CarriedHp } from "src/services/encounters/dnd5e/dnd5eEncounterEngine.js";
import type { CombatProfileLoader } from "src/services/encounters/dnd5e/dnd5eRequestHandler.js";
import { combatProfile, encounterState } from "../fixtures/encounters.js";

export class RecordingEncounterEngine extends DnD5eEncounterEngine {
  readonly snapshots: DnD5eEncounterState[] = [];
  readonly memberships: Map<number, number>[] = [];
  readonly statuses: CoreEncounter["status"][] = [];
  readonly carriedHp: CarriedHp[][] = [];

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

  protected override async persistStatus(status: CoreEncounter["status"]): Promise<void> {
    if (this.statusSaveError) throw this.statusSaveError;
    this.statuses.push(status);
  }

  protected override async persistCarriedHp(carried: CarriedHp[]): Promise<void> {
    if (this.carriedHpSaveError) throw this.carriedHpSaveError;
    this.carriedHp.push(structuredClone(carried));
  }
}
