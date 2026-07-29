import type { DnD5eEncounterState } from './encounter.js';
import type { DnD5eEntityState } from './entity.js';
import type { DnD5eEncounterEvent } from './events/types.js';
import { resolveEncounterSettings } from './settings.js';

export const entity = (overrides: Partial<DnD5eEntityState> = {}): DnD5eEntityState => ({
  templateId: 100, instanceId: 0, inGrave: false, hidden: false,
  maxHp: 10, currentHp: 10, tempHp: 0, initiative: 20,
  isConcentrating: false, reactionUsed: false, deathSaveSuccesses: 0,
  deathSaveFailures: 0, conditions: [], ...overrides,
});

export const state = (count = 3, overrides: Partial<DnD5eEncounterState> = {}): DnD5eEncounterState => ({
  id: 12, system: 'dnd5e', version: 0, phase: 'running', currentRound: 1, currentTurn: 0,
  settings: resolveEncounterSettings(), nextInstanceId: count,
  initiativeOrder: Array.from({ length: count }, (_, i) => i),
  entityStates: Array.from({ length: count }, (_, i) => entity({ instanceId: i, templateId: 100 + i, initiative: 20 - i })),
  ...overrides,
});

export const damage = (targetId: number, amount = 10): DnD5eEncounterEvent =>
  ({ type: 'damage', values: { targetId, sourceId: 0, amount } });
export const bury = (targetId: number): DnD5eEncounterEvent =>
  ({ type: 'moveToGrave', values: { targetId } });
export const add = (overrides: Partial<Extract<DnD5eEncounterEvent, { type: 'addEntity' }>['values']> = {}): DnD5eEncounterEvent =>
  ({ type: 'addEntity', values: { templateId: 7, name: 'Goblin', hp: 10, ...overrides } });
