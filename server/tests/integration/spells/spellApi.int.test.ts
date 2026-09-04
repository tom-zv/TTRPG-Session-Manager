import { expect, test } from 'vitest';
import type { Spell, SpellInput } from 'shared/domain/dnd5e/spell.js';
import { createGm } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

const path = '/api/dnd5e/spells';
const homebrew: SpellInput = {
  name: 'Ember Lance', source: 'homebrew', level: 2, school: 'evocation', ritual: false, concentration: false,
  castingTime: '1 action', castingUnit: 'action', range: '60 feet', rangeFeet: 60,
  components: { v: true, s: true, m: false }, materialConsumed: false, duration: 'Instantaneous',
  description: 'A lance of fire.', classes: ['Wizard'], damageTypes: ['fire'], saves: [], conditions: [], aliases: [],
};

test('creating an invalid spell returns the level field path', async () => {
  const http = createHttpAgent();
  const gm = await createGm();
  const response = await asToken(http.post(path), gm.token).send({ ...homebrew, level: 10 }).expect(400);
  expect(response.body).toEqual({
    message: 'Invalid spell data.',
    details: [{ path: 'level', message: 'Level must be a whole number from 0 (cantrip) to 9.' }],
  });
});

test('updating an invalid spell returns the components field path', async () => {
  const http = createHttpAgent();
  const gm = await createGm();
  const created = await asToken(http.post(path), gm.token).send(homebrew).expect(201);
  const { spell } = created.body as { spell: Spell };
  const response = await asToken(http.put(`${path}/${spell.id}`), gm.token)
    .send({ ...homebrew, components: { v: true, s: 'yes', m: false } }).expect(400);
  expect(response.body).toEqual({
    message: 'Invalid spell data.',
    details: [{ path: 'components', message: 'Components must say which of V, S and M apply.' }],
  });
});
