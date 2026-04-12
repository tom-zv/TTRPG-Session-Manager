import type {
  EncounterDB,
  encounterUpdateDataDB,
  gm_note,
  EncounterInsertData,
} from "src/api/encounter/encounters/types.js";
import type { DnD5eEncounter, DnD5eEncounterDetails } from "shared/domain/encounters/dnd5e/encounter.js";

const EMPTY_GM_NOTE: gm_note = { text: "", timestamp: "" };

function normalizeGmNote(gmNotes?: gm_note[] | null): gm_note {
  if (Array.isArray(gmNotes) && gmNotes.length > 0) {
    const { text = "", timestamp = "" } = gmNotes[0] ?? EMPTY_GM_NOTE;
    return { text, timestamp };
  }
  return { ...EMPTY_GM_NOTE };
}

function serializeGmNote(note?: gm_note | null): gm_note[] {
  if (!note) return [];
  const { text = "", timestamp = "" } = note;
  return [{ text, timestamp }];
}

// Type for encounter create/update operations (excludes entities)
type EncounterUpsertSource = DnD5eEncounterDetails & {
  encounterEntities?: DnD5eEncounter["entities"];
};

/** DND 5e  **/
export function dnd5eEncounterDbToDomainDetails(
  encounterDb: EncounterDB,
): DnD5eEncounterDetails {
  return {
    id: encounterDb.id,
    system: 'dnd5e',
    name: encounterDb.name,
    description: encounterDb.description ?? "",
    status: encounterDb.status,
    location: encounterDb.location ?? "",
    difficulty: encounterDb.difficulty ?? "",
    gmNotes: normalizeGmNote(encounterDb.gm_notes),
    createdAt: encounterDb.created_at,
  };
}

export function dnd5eEncounterToInsertDb(
  encounter: EncounterUpsertSource,
  systemId: number
): EncounterInsertData {
  return {
    system_id: systemId,
    name: encounter.name,
    description: encounter.description ?? null,
    location: encounter.location ?? null,
    difficulty: encounter.difficulty ?? null,
    gm_notes: serializeGmNote(encounter.gmNotes),
  };
}

export function dnd5eEncounterToUpdateDb(
  update: Partial<EncounterUpsertSource>
): encounterUpdateDataDB {
  const dbUpdate: encounterUpdateDataDB = {};

  if (update.name !== undefined) dbUpdate.name = update.name;
  if (update.description !== undefined) dbUpdate.description = update.description;
  if (update.status !== undefined) dbUpdate.status = update.status;
  if (update.location !== undefined) dbUpdate.location = update.location;
  if (update.difficulty !== undefined) dbUpdate.difficulty = update.difficulty;
  if (update.gmNotes !== undefined) dbUpdate.gm_notes = serializeGmNote(update.gmNotes);

  return dbUpdate;
}