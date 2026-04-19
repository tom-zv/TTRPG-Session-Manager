import { GlobalHandlerMap} from "../types.js";
import { DnD5eEntityState, } from "../../entity.js";

export const makeEntityStateful = (templateId: number, instanceId: number, hp: number, displayName?: string): DnD5eEntityState => ({
    templateId,
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

export const globalHandler = {
    addEntity(state, event){
      const instanceId = state.entityStates.reduce((maxId, entity) => {
        return Math.max(maxId, entity.instanceId);
      }, -1) + 1;
      const sameTemplate = state.entityStates.filter((entity) => entity.templateId === event.values.templateId);
    
      // Update existing entity of same template to "Name 1" if this is the second instance
      if (sameTemplate.length === 1) {
        sameTemplate[0].displayName = `${event.values.name} 1`;
      }
      
      // Set display name for new entity
      const displayName = sameTemplate.length > 0 ? `${event.values.name} ${sameTemplate.length + 1}` : undefined;
      
      state.entityStates.push(makeEntityStateful(event.values.templateId, instanceId, event.values.hp, displayName));
    },

    removeEntity(state, event){
        state.entityStates = state.entityStates.filter((entity) => entity.instanceId !== event.values.instanceId);
        state.initiativeOrder = state.initiativeOrder.filter((id) => id !== event.values.instanceId);

        if (state.initiativeOrder.length === 0) {
          state.currentTurn = 0;
          return;
        }

        if (state.currentTurn >= state.initiativeOrder.length) {
          state.currentTurn = 0;
        }
    },

    nextTurn(state) {
      const initiativeCount = state.initiativeOrder.length;
      console.log(`Current turn: ${state.currentTurn}, Initiative count: ${initiativeCount}`);

      if (initiativeCount === 0) {
        state.currentTurn = 0;
        return;
      }

      const normalizedTurn = state.currentTurn < 0 ? 0 : state.currentTurn % initiativeCount;
      const nextTurn = normalizedTurn + 1;

      console.log(`Normalized turn: ${normalizedTurn}, Next turn: ${nextTurn}`);

      if (nextTurn >= initiativeCount) {
        state.currentTurn = 0;
        state.currentRound += 1;
        console.log(`Starting new round: ${state.currentRound}`);
        return;
      }
      
      state.currentTurn = nextTurn;
    },

    resetEncounter(state) {
      state.currentRound = 0;
      state.currentTurn = 0;
      state.entityStates = state.entityStates.map((entity) => ({
        ...entity,
        initiative: 0,
        currentHp: entity.maxHp,
        tempHp: 0,
        deathSaveSuccesses: 0,
        deathSaveFailures: 0,
        reactionUsed: false,
        isConcentrating: false,
        conditions: [],
      }));
    },
} as GlobalHandlerMap