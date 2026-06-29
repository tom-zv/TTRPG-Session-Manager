import { GlobalHandlerMap} from "../types.js";
import { DnD5eEntityState, } from "../../entity.js";
import { rebuildInitiativeOrder, setInitiativeOrder } from "../../initiative.js";
import { mergeSettings } from "../../../settings.js";

export const makeEntityStateful = (templateId: number, instanceId: number, hp: number, displayName?: string, hidden = false): DnD5eEntityState => ({
    templateId,
    inGrave: false,
    hidden,
    instanceId, 
    displayName,
    maxHp: hp,
    currentHp: hp,
    tempHp: 0,
    initiative: 0,
    isConcentrating: false,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    reactionUsed: false,
    conditions: [],
});

/** The N of a "Name N" label, or 0 when the label is absent or not numbered. */
function labelNumber(displayName: string | undefined, name: string): number {
  if (!displayName?.startsWith(`${name} `)) return 0;
  const number = Number(displayName.slice(name.length + 1));
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export const globalHandler = {
    addEntity(state, event){
      const { templateId, name, hp, hidden } = event.values;
      const instanceId = state.nextInstanceId;
      state.nextInstanceId = instanceId + 1;

      // A lone copy uses the template name. From the second copy on, each gets a numbered
      // label. A label is assigned once and never changed, so removing "Goblin 1" does not
      // rename "Goblin 2".
      const sameTemplate = state.entityStates.filter((entity) => entity.templateId === templateId);
      let highest = sameTemplate.reduce((max, entity) => Math.max(max, labelNumber(entity.displayName, name)), 0);
      for (const entity of sameTemplate) {
        if (entity.displayName === undefined) entity.displayName = `${name} ${++highest}`;
      }
      const displayName = sameTemplate.length > 0 ? `${name} ${++highest}` : undefined;

      state.entityStates.push(makeEntityStateful(templateId, instanceId, hp, displayName, hidden === true));
      state.initiativeOrder.push(instanceId);
    },

    removeEntity(state, event){
        state.entityStates = state.entityStates.filter((entity) => entity.instanceId !== event.values.instanceId);
        setInitiativeOrder(state, state.initiativeOrder.filter((id) => id !== event.values.instanceId));
    },

    /** Setup to running: round 1 begins with whoever is first in initiative. */
    startCombat(state) {
      if (state.phase !== "setup") return;
      rebuildInitiativeOrder(state);
      state.phase = "running";
      state.currentRound = 1;
      state.currentTurn = 0;
    },

    endCombat(state) {
      if (state.phase !== "running") return;
      state.phase = "ended";
    },

    nextTurn(state) {
      if (state.phase !== "running") return;
      const initiativeCount = state.initiativeOrder.length;

      if (initiativeCount === 0) {
        state.currentTurn = 0;
        return;
      }

      const normalizedTurn = state.currentTurn < 0 ? 0 : state.currentTurn % initiativeCount;
      const nextTurn = normalizedTurn + 1;

      if (nextTurn >= initiativeCount) {
        state.currentTurn = 0;
        state.currentRound += 1;
        return;
      }
      
      state.currentTurn = nextTurn;
    },

    resetEncounter(state) {
      state.phase = "setup";
      state.currentRound = 0;
      state.currentTurn = 0;
      state.entityStates = state.entityStates.map((entity) => ({
        ...entity,
        inGrave: false,
        initiative: 0,
        currentHp: entity.maxHp,
        tempHp: 0,
        deathSaveSuccesses: 0,
        deathSaveFailures: 0,
        reactionUsed: false,
        isConcentrating: false,
        conditions: [],
      }));
      rebuildInitiativeOrder(state);
    },
    updateEncounterSettings(state, event) {
      state.settings = mergeSettings(state.settings, event.values.patch);
    },
} as GlobalHandlerMap
