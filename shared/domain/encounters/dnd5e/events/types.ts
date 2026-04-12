import { DnD5eEntityState } from "../entity.js";
import { DnD5eEncounterState } from "../encounter.js";

type GlobalEventBase<T extends string, V extends object> = { type: T; values: V };
type TargetedEventBase<T extends string, V extends object> = { 
  type: T; 
  values: V & { targetId: number } 
};

export type DnD5eEncounterEvent = 
  | GlobalEventBase<'addEntity', { templateId: number, name: string, hp: number }>
  | GlobalEventBase<'removeEntity', { instanceId: number }>
  | TargetedEventBase<'damage', { sourceId: number; amount: number }>
  | TargetedEventBase<'heal', { sourceId: number; amount: number }>
  | TargetedEventBase<'setHp', { hp: number }>
  | TargetedEventBase<'setCurrentHp', { hp: number }>
  | TargetedEventBase<'setTempHp', { sourceId: number; tempHp: number }>
  | TargetedEventBase<'setInitiative', { initiative: number }>;

export type EntityEvent = Extract<DnD5eEncounterEvent, { values: { targetId: number } }>;
export type GlobalEvent = Exclude<DnD5eEncounterEvent, EntityEvent>;

export function isEntityEvent(e: DnD5eEncounterEvent): e is EntityEvent {
  return 'targetId' in e.values;
}

export type GlobalHandlerMap = {
  [K in GlobalEvent['type']]: (
    state: DnD5eEncounterState, 
    e: Extract<GlobalEvent, { type: K }>
  ) => void;
}

export type PartialGlobalHandlerMap = Partial<GlobalHandlerMap>;

export type EntityHandlerMap = {
  [K in EntityEvent['type']]: (
    state: DnD5eEncounterState, 
    entity: DnD5eEntityState, 
    e: Extract<EntityEvent, { type: K }>
  ) => void;
}

export type PartialEntityHandlerMap = Partial<EntityHandlerMap>;
