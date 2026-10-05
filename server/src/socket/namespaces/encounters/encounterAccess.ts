import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import encounterModel from "src/api/encounter/encounters/encounterModel.js";
import currentEncounterModel from "src/api/campaigns/currentEncounterModel.js";
import campaignService from "src/api/campaigns/campaignService.js";
import { NotFoundError } from "src/api/HttpErrors.js";
import { readEncounterPhase } from "src/services/encounters/encounterSystems.js";
import type { UserDB } from "src/api/users/types.js";
import { EncounterHandlerError } from "./encounterHandlerError.js";
import { EncounterAuthorizationError } from "src/services/encounters/EncounterAuthorizationError.js";
import type { SqlExecutor } from "src/db.js";

type Viewer = Pick<UserDB, "id" | "is_gm">;

const notFound = () => new EncounterHandlerError(EncounterErrorCode.ENCOUNTER_NOT_FOUND, "Encounter not found");

/** The encounter's campaign, when the user can reach it; otherwise it answers like a missing one. */
async function reachableEncounter(user: Viewer, encounterId: number) {
  const encounter = await encounterModel.getEncounterDetailsById(encounterId);
  if (!encounter) throw notFound();
  try {
    await campaignService.assertCampaignAccess(user, encounter.campaign_id);
  } catch (error) {
    if (error instanceof NotFoundError) throw notFound();
    throw error;
  }
  return encounter;
}

/**
 * Who may join an encounter's room: a GM any encounter; a player of the campaign its current
 * encounter (prep stays private until the GM starts it) or one whose combat has ended, which is
 * the campaign's history. The stored phase decides, never the status label. Membership, the
 * selection and the phase are read on every join, so a change applies to the next one. Anything
 * else answers like a missing encounter.
 */
export async function assertMayJoin(user: Viewer, encounterId: number): Promise<void> {
  const encounter = await reachableEncounter(user, encounterId);
  if (user.is_gm) return;
  if ((await currentEncounterModel.getCurrentEncounterId(encounter.campaign_id)) === encounterId) return;
  if ((await readEncounterPhase(encounterId, encounter.system)) === "ended") return;
  throw notFound();
}

/**
 * Check membership and selection when the queued request starts. A player write also checks the
 * selection under lock before committing so a replacement and the write have a definite order.
 */
export async function preparePlayerCommit(user: Viewer, encounterId: number) {
  if (user.is_gm) return;
  const encounter = await reachableEncounter(user, encounterId);
  const assertCurrent = (selectedId: number | null) => {
    if (selectedId !== encounterId) {
      throw new EncounterAuthorizationError("This encounter is no longer the campaign's current encounter");
    }
  };
  assertCurrent(await currentEncounterModel.getCurrentEncounterId(encounter.campaign_id));
  return async (transaction: SqlExecutor) => {
    assertCurrent(await currentEncounterModel.lockCurrentEncounterId(encounter.campaign_id, transaction));
  };
}
