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
      const instanceId = state.entityStates.length;
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
    }
} as GlobalHandlerMap