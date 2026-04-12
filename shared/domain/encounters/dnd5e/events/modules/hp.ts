import { PartialEntityHandlerMap } from "../types.js";

// TODO add stat logging
export const hpHandlers = {
  damage(_s, entity, event){
    let damage = event.values.amount;

    if (entity.tempHp > 0) {
      const tempDamage = Math.min(damage, entity.tempHp);
      entity.tempHp -= tempDamage;
      damage -= tempDamage;
    }
    entity.currentHp = Math.max(0, entity.currentHp - damage);
    // Check overkill - negative entity.hp reached
  },

  /**
   * Heal an entity up to their maximum HP
   */
  heal(_s, entity, event){
    entity.currentHp = Math.min(entity.maxHp, entity.currentHp + event.values.amount);
  },

  /**
   * Set both current and maximum HP to the specified value
   */
  setHp(_s, entity, event){
    entity.currentHp = event.values.hp;
    entity.maxHp = event.values.hp;
  },

  /**
   * Set current HP directly,
   * If the new current HP exceeds max HP, max HP is also increased
   */
  setCurrentHp(_s, entity, event){
    entity.currentHp = Math.max(0, event.values.hp);
    // If current HP exceeds max HP, increase max HP to match
    if (entity.currentHp > entity.maxHp) {
      entity.maxHp = entity.currentHp;
    }
  },

  /**
   * Set an entity's temporary HP (takes the higher value)
   */
  setTempHp(_s, entity, event){
    entity.tempHp = Math.max(entity.tempHp, event.values.tempHp);
  }
} satisfies PartialEntityHandlerMap;