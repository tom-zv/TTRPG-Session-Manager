import { expect, test } from 'vitest';
import type { DnD5eEntityDetails } from 'shared/domain/encounters/dnd5e/entity.js';
import type { CreateEntityRequest } from 'shared/domain/encounters/dnd5e/entityValidation.js';
import { import5eToolsEntities } from 'src/services/5etools/5eToolsEntityImportService.js';
import { createGm } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

const entitiesUrl = '/api/dnd5e/entities';

async function setup() {
  const http = createHttpAgent();
  const { token } = await createGm();
  const post = (data: unknown) => asToken(http.post(entitiesUrl), token).send({ data });
  const put = (id: number, data: unknown) => asToken(http.put(`${entitiesUrl}/${id}`), token).send({ data });
  const get = (id: number) => asToken(http.get(`${entitiesUrl}/${id}`), token);
  const create = async (data: Pick<CreateEntityRequest, 'name'> & Partial<CreateEntityRequest>) => {
    const response = await post(data).expect(201);
    return (response.body as { entity: DnD5eEntityDetails }).entity;
  };
  return { post, put, get, create };
}

test('POST and PUT return field issues for malformed writes and leave stored data intact', async () => {
  const { post, put, get, create } = await setup();
  const invalid = await post({ name: ' ', traits: {} }).expect(400);
  expect(invalid.body).toMatchObject({
    details: expect.arrayContaining([
      { path: 'name', message: expect.any(String) },
      { path: 'traits', message: expect.any(String) },
    ]),
  });
  const missing = await post(undefined).expect(400);
  expect(missing.body).toMatchObject({
    details: [{ path: '', message: expect.any(String) }],
  });

  const entity = await create({ name: 'Storm Herald' });
  const response = await put(entity.templateId, {
    name: 'Invalid rename',
    actions: [{ name: 'x'.repeat(65), description: 'The strike lands.', actionType: 'action' }],
    settings: { party: { member: 'yes' } },
  }).expect(400);
  expect(response.body).toMatchObject({
    details: expect.arrayContaining([
      { path: 'actions.0.name', message: expect.any(String) },
      { path: 'settings', message: expect.any(String) },
    ]),
  });
  const after = await get(entity.templateId).expect(200);
  expect(after.body).toMatchObject({ entity: { name: 'Storm Herald', actions: [] } });
});

test('both a detail read and a template update return 404 for a missing entity', async () => {
  const { get, put } = await setup();
  const detail = await get(999_999).expect(404);
  const update = await put(999_999, { name: 'Missing entity' }).expect(404);
  expect(detail.body).toMatchObject({ message: expect.any(String) });
  expect(update.body).toEqual(detail.body);
});

test('a partial PUT keeps omitted child collections and can clear a nullable scalar', async () => {
  const { create, put, get } = await setup();
  const entity = await create({
    name: 'Storm Herald',
    passivePerception: 12,
    senses: [' Darkvision 60 ft. ', 'DARKVISION 60 FT.'],
    traits: [{ name: 'Storm Shield', description: 'The winds shield the herald.' }],
    resistances: [{ damageType: 'lightning' }],
    immunities: [{ damageType: 'thunder' }],
    vulnerabilities: [{ damageType: 'fire' }],
    conditionImmunities: [{ conditionName: 'frightened' }],
    actions: [{ name: 'Strike', description: 'The strike lands.', actionType: 'action' }],
    spellcasting: [{ name: 'Magic', descriptions: [], frequencyGroups: [{
      frequency: 'will', spells: [{ name: 'Guidance' }],
    }] }],
  });

  const changed = await put(entity.templateId, { name: '  Gale Herald  ', passivePerception: null }).expect(200);
  expect(changed.body).toEqual({ entity: { ...entity, name: 'Gale Herald', passivePerception: null } });
  const after = await get(entity.templateId).expect(200);
  expect(after.body).toEqual(changed.body);
  expect(after.body).toMatchObject({ entity: { senses: ['Darkvision 60 ft.'] } });
});

test('a full PUT replaces child rows and can clear a collection without changing the entity ID', async () => {
  const { create, put, get } = await setup();
  const entity = await create({
    name: 'Storm Herald',
    traits: [{ name: 'Storm Shield', description: 'The winds shield the herald.' }],
    actions: [{ name: 'Strike', description: 'The strike lands.', actionType: 'action' }],
  });
  const updated = await put(entity.templateId, {
    ...entity,
    traits: [],
    actions: [{ name: 'Gust', description: '  The target is pushed. ', actionType: 'reaction' }],
  }).expect(200);

  const after = await get(entity.templateId).expect(200);
  expect(after.body).toEqual(updated.body);
  expect(after.body).toMatchObject({ entity: {
    templateId: entity.templateId,
    name: 'Storm Herald',
    traits: [],
    actions: [{ name: 'Gust', description: 'The target is pushed.', actionType: 'reaction' }],
  } });

  await put(entity.templateId, { actions: [] }).expect(200);
  const cleared = await get(entity.templateId).expect(200);
  expect(cleared.body).toMatchObject({ entity: { name: 'Storm Herald', actions: [] } });
});

test('a full monster re-import still removes traits and senses absent from the upstream record', async () => {
  const { get } = await setup();
  const monster = { name: 'Storm Herald', source: 'MM' };
  const imported = await import5eToolsEntities([{
    ...monster,
    senses: ['darkvision 60 ft.'],
    trait: [{ name: 'Storm Shield', entries: ['The winds shield the herald.'] }],
  }]);
  const id = imported.results[0].entityId;
  if (id === undefined) throw new Error('The test monster was not imported.');
  const before = await get(id).expect(200);
  expect(before.body).toMatchObject({ entity: { traits: [{ name: 'Storm Shield' }], senses: ['darkvision 60 ft.'] } });

  const replaced = await import5eToolsEntities([monster]);
  expect(replaced.results[0]).toMatchObject({ status: 'updated', entityId: id });
  const after = await get(id).expect(200);
  expect(after.body).toMatchObject({ entity: { traits: [], senses: [] } });
});

test('an entity whose speeds were cleared can echo its read snapshot back in a PUT', async () => {
  const { post, put, get } = await setup();
  const created = await post({ name: 'Storm Herald', speeds: null }).expect(201);
  const entity = (created.body as { entity: DnD5eEntityDetails }).entity;
  expect(entity.speeds).toEqual({ walk: 30 });

  await put(entity.templateId, { speeds: null }).expect(200);
  const legacy = await get(entity.templateId).expect(200);
  const snapshot = (legacy.body as { entity: DnD5eEntityDetails }).entity;
  expect(snapshot.speeds).toBeNull();

  const renamed = await put(entity.templateId, { ...snapshot, name: 'Gale Herald' }).expect(200);
  expect(renamed.body).toEqual({ entity: { ...snapshot, name: 'Gale Herald' } });
  const after = await get(entity.templateId).expect(200);
  expect(after.body).toEqual(renamed.body);
});

test('a sense with an unpaired surrogate is rejected at its path before it reaches MySQL', async () => {
  const { post, create } = await setup();
  const rejected = await post({ name: 'Storm Herald', senses: ['\ud800', '�'] }).expect(400);
  expect(rejected.body).toMatchObject({ details: [{ path: 'senses.0', message: expect.any(String) }] });

  const entity = await create({ name: 'Storm Herald', senses: ['Ténèbres 😀 60 ft.', 'TÉNÈBRES 😀 60 FT.', '�'] });
  expect(entity.senses).toEqual(expect.arrayContaining(['Ténèbres 😀 60 ft.', '�']));
  expect(entity.senses).toHaveLength(2);
});
