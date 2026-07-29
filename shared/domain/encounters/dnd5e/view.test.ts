import { expect, test } from 'vitest';
import { controlsEntity, isVisibleTo, hpDisplayFor, getHpStatus } from './view.js';
import { resolveEncounterSettings } from './settings.js';

test("A GM controls every entity and a player controls only entities explicitly assigned to their user ID.", () => {
  for (const userId of [undefined, 0, 2, 3]) {
    for (const controllerUserIds of [undefined, [], [2], [0]]) {
      expect(controlsEntity({ userId, isGm: true }, { controllerUserIds })).toBe(true);
      expect(controlsEntity({ userId, isGm: false }, { controllerUserIds })).toBe(userId !== undefined && (controllerUserIds ?? []).includes(userId));
    }
  }
});

test("Hidden entities are visible only to the GM, even when a player controls them.", () => {
  for (const isGm of [false, true]) {
    for (const hidden of [false, true]) {
      const entity = { hidden, controllerUserIds: [2] };
      expect(isVisibleTo({ userId: 2, isGm }, entity)).toBe(isGm || !hidden);
      expect(isVisibleTo({ userId: undefined, isGm }, entity)).toBe(isGm || !hidden);
    }
  }
});

test("GMs, controllers and viewers of PCs see exact HP, while uncontrolled NPCs and creatures follow every monster HP visibility mode.", () => {
  for (const mode of ['exact', 'status', 'hidden'] as const) {
    const settings = resolveEncounterSettings({ visibility: { monsterHp: mode } });
    for (const role of ['pc', 'npc', 'creature']) {
      const entity = { role, controllerUserIds: [2] };
      expect(hpDisplayFor({ userId: 1, isGm: true }, entity, settings)).toBe('exact');
      expect(hpDisplayFor({ userId: 2, isGm: false }, entity, settings)).toBe('exact');
      for (const userId of [3, undefined]) expect(hpDisplayFor({ userId, isGm: false }, entity, settings)).toBe(role === 'pc' ? 'exact' : mode);
    }
  }
});

test("HP status is down at zero, bloodied at or below half, and healthy above half.", () => {
  for (const [currentHp, maxHp, expected] of [[0, 10, 'down'], [1, 10, 'bloodied'], [5, 10, 'bloodied'],
    [6, 10, 'healthy'], [10, 10, 'healthy'], [4, 9, 'bloodied'], [5, 9, 'healthy'], [0, 0, 'down'], [1, 0, 'healthy']] as const) {
    expect(getHpStatus({ currentHp, maxHp })).toBe(expected);
  }
});

