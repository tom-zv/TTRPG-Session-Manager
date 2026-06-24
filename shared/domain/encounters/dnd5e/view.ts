/**
 * Who may act on what. Shared so the server enforces exactly what the client offers.
 */

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
