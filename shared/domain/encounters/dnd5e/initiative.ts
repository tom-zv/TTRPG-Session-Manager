import type { DnD5eEncounterState } from "./encounter.js";

/** Change membership/order without changing the actor whose turn is in progress. */
export function setInitiativeOrder(state: DnD5eEncounterState, order: number[]): void {
  const previous = state.initiativeOrder;
  const turn = previous.length ? Math.max(0, state.currentTurn) % previous.length : 0;
  const actor = previous[turn];
  state.initiativeOrder = order;
  if (!order.length) {
    state.currentTurn = 0;
    return;
  }
  const preserved = actor === undefined ? -1 : order.indexOf(actor);
  if (preserved >= 0) {
    state.currentTurn = preserved;
    return;
  }
  // The current actor was removed. Find the next survivor in the previous order.
  for (let offset = 1; offset < previous.length; offset++) {
    const next = (turn + offset) % previous.length;
    const nextIndex = order.indexOf(previous[next]);
    if (nextIndex >= 0) {
      state.currentTurn = nextIndex;
      if (next <= turn) state.currentRound += 1;
      return;
    }
  }
  state.currentTurn = 0;
}

export function rebuildInitiativeOrder(state: DnD5eEncounterState): void {
  setInitiativeOrder(state, state.entityStates
    .filter((entity) => !entity.inGrave)
    .sort((a, b) => b.initiative - a.initiative || a.instanceId - b.instanceId)
    .map((entity) => entity.instanceId));
}
