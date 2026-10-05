import { expect, test } from 'vitest';
import { controlsEntity, isVisibleTo, hpDisplayFor, getHpStatus, hasControlledCombatant, mayAdjustHp, mayRunEntity, maySetHpValues } from './view.js';
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

test("GMs and every player viewing a PC see exact HP, while NPCs and creatures follow every monster HP visibility mode, also for the player controlling them.", () => {
  for (const mode of ['exact', 'status', 'hidden'] as const) {
    const settings = resolveEncounterSettings({ visibility: { monsterHp: mode } });
    for (const role of ['pc', 'npc', 'creature']) {
      const entity = { role, controllerUserIds: [2] };
      expect(hpDisplayFor({ userId: 1, isGm: true }, entity, settings)).toBe('exact');
      for (const userId of [2, 3, undefined]) expect(hpDisplayFor({ userId, isGm: false }, entity, settings)).toBe(role === 'pc' ? 'exact' : mode);
    }
  }
});

test("HP status is down at zero, bloodied at or below half, and healthy above half.", () => {
  for (const [currentHp, maxHp, expected] of [[0, 10, 'down'], [1, 10, 'bloodied'], [5, 10, 'bloodied'],
    [6, 10, 'healthy'], [10, 10, 'healthy'], [4, 9, 'bloodied'], [5, 9, 'healthy'], [0, 0, 'down'], [1, 0, 'healthy']] as const) {
    expect(getHpStatus({ currentHp, maxHp })).toBe(expected);
  }
});


test("A player acts only during a running fight on entities in play (not hidden, not buried): damage and healing with a combatant of their own in play, initiative on their own, and HP values on their own with exact HP; the GM always may.", () => {
  type E = { id: number; hidden: boolean; inGrave: boolean; mine: boolean; exact: boolean };
  const entity = (id: number, overrides: Partial<E>): E => ({ id, hidden: false, inGrave: false, mine: false, exact: true, ...overrides });
  const mine = entity(0, { mine: true });
  const hiddenMine = entity(1, { hidden: true, mine: true });
  const buriedMine = entity(2, { inGrave: true, mine: true });
  const concealedMine = entity(3, { mine: true, exact: false });
  const theirs = entity(4, {});
  const lurker = entity(5, { hidden: true });
  const buried = entity(6, { inGrave: true });
  const inPlay = (e: E) => !e.hidden && !e.inGrave;
  for (const running of [false, true]) {
    for (const isGm of [false, true]) {
      const context = {
        isGm,
        running,
        controls: (e: E) => e.mine,
        hpDisplay: (e: E) => (e.exact ? "exact" as const : "status" as const),
      };
      for (const entities of [
        [mine, theirs, lurker, buried],
        [hiddenMine, theirs],
        [buriedMine, theirs, buried],
        [concealedMine, theirs],
        [theirs, lurker],
      ]) {
        const hasOwn = entities.some((e) => e.mine && inPlay(e));
        expect(hasControlledCombatant(context, entities)).toBe(hasOwn);
        for (const target of entities) {
          const runs = isGm || (running && inPlay(target) && target.mine);
          expect(mayAdjustHp(context, entities, target)).toBe(isGm || (running && inPlay(target) && hasOwn));
          expect(mayRunEntity(context, target)).toBe(runs);
          expect(maySetHpValues(context, target)).toBe(isGm || (runs && target.exact));
        }
      }
    }
  }
});
