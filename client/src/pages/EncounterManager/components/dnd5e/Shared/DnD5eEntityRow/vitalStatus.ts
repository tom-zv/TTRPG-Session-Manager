import type { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { usesDeathSaves } from "shared/domain/encounters/dnd5e/settings.js";

/**
 * How a 0 HP entity reads at the table. `null` while above 0 HP.
 * - `down`: no death saves; waits for the DM to bury or heal it.
 * - `dying` / `stable` / `dead`: death-save users, from their counters.
 */
export type VitalStatus = "down" | "dying" | "stable" | "dead";

export const VITAL_STATUS_LABEL: Record<VitalStatus, string> = {
  down: "Down",
  dying: "Dying",
  stable: "Stable",
  dead: "Dead",
};

export function getVitalStatus(entity: DnD5eEntity): VitalStatus | null {
  if (entity.currentHp > 0) return null;
  if (!usesDeathSaves(entity)) return "down";
  if (entity.deathSaveFailures >= 3) return "dead";
  if (entity.deathSaveSuccesses >= 3) return "stable";
  return "dying";
}

/** Statuses where burying is the expected next step, so the row offers it directly. */
export const isAwaitingBurial = (status: VitalStatus | null): boolean =>
  status === "down" || status === "dead";
