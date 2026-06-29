/**
 * Who may act on what, and what each person is shown.
 *
 * Acting rules are shared so the server enforces exactly what the client offers. Display rules
 * are applied by the client only: every client receives the full encounter state, and these
 * functions decide what to draw. They are a table convenience, not a secrecy boundary.
 */
import type { EncounterSettings } from "./settings.js";

/** The person looking at or acting on an encounter. */
export type EncounterViewer = {
  userId: number | undefined;
  isGm: boolean;
};

/** A GM controls everything; a player controls the entities assigned to them. */
export function controlsEntity(viewer: EncounterViewer, entity: { controllerUserIds?: number[] }): boolean {
  if (viewer.isGm) return true;
  return viewer.userId !== undefined && (entity.controllerUserIds ?? []).includes(viewer.userId);
}

/** A hidden entity is drawn for the GM only. */
export function isVisibleTo(viewer: EncounterViewer, entity: { hidden: boolean }): boolean {
  return viewer.isGm || !entity.hidden;
}

/** How much of an entity's HP a viewer is shown. */
export type HpDisplay = "exact" | "status" | "hidden";

/**
 * Exact for the GM, for the entity's own player and for every player character. For NPCs and
 * creatures the encounter's `visibility.monsterHp` setting decides.
 */
export function hpDisplayFor(
  viewer: EncounterViewer,
  entity: { role: string; controllerUserIds?: number[] },
  settings: EncounterSettings
): HpDisplay {
  if (entity.role === "pc" || controlsEntity(viewer, entity)) return "exact";
  return settings.visibility.monsterHp;
}

/** The rough state shown in place of numbers. Bloodied means at or below half of maximum HP. */
export type HpStatus = "healthy" | "bloodied" | "down";

export const HP_STATUS_LABEL: Record<HpStatus, string> = {
  healthy: "Healthy",
  bloodied: "Bloodied",
  down: "Down",
};

export function getHpStatus(entity: { currentHp: number; maxHp: number }): HpStatus {
  if (entity.currentHp <= 0) return "down";
  return entity.currentHp * 2 <= entity.maxHp ? "bloodied" : "healthy";
}
