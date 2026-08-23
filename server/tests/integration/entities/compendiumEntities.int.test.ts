import { describe, expect, test } from 'vitest';
import type { DnD5eEntityDetails, DnD5eEntitySummary } from 'shared/domain/encounters/dnd5e/entity.js';
import type { EntityProvenanceField } from 'shared/domain/encounters/dnd5e/entityValidation.js';
import { createGm, createPlayer } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

type NewEntity = Omit<DnD5eEntityDetails, 'templateId' | 'createdAt' | EntityProvenanceField>;

const baseEntity = (name: string, patch: Partial<NewEntity> = {}): NewEntity => ({
  name,
  role: 'creature',
  ac: 12,
  hp: 20,
  speeds: { walk: 30 },
  size: 'medium',
  alignment: 'neutral',
  abilityScores: { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
  ...patch,
});

async function setup() {
  const http = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const other = await createPlayer();

  const create = async (entity: NewEntity): Promise<DnD5eEntityDetails> => {
    const response = await asToken(http.post('/api/dnd5e/entities'), gm.token).send({ data: entity }).expect(201);
    return (response.body as { entity: DnD5eEntityDetails }).entity;
  };
  const assign = (entityId: number, userIds: number[]) =>
    asToken(http.put(`/api/dnd5e/entities/${entityId}/controllers`), gm.token).send({ userIds }).expect(200);

  // The plan's cast: an assigned PC outside the party, an unassigned party PC, an assigned NPC.
  const bram = await create(baseEntity('Bram', { role: 'pc', hp: 33 }));
  const aria = await create(baseEntity('Aria', { role: 'pc', hp: 40, settings: { party: { member: true } } }));
  const mara = await create(baseEntity('Mara', { role: 'npc', cr: '2', creatureType: 'humanoid' }));
  await assign(bram.templateId, [player.user.id]);
  await assign(mara.templateId, [player.user.id]);
  await assign(aria.templateId, [other.user.id]);

  return { http, gm, player, other, bram, aria, mara, create };
}

describe('entity summaries', () => {
  test('a created entity appears in the summary list with its type, size and party flags', async () => {
    const { http, gm, aria, create } = await setup();
    const goblin = await create(baseEntity('Goblin', { cr: '1/4', creatureType: 'humanoid', size: 'small', hp: 7 }));

    const response = await asToken(http.get('/api/dnd5e/entities/summary'), gm.token).expect(200);
    const summaries = (response.body as { entities: DnD5eEntitySummary[] }).entities;
    expect(summaries.find(item => item.templateId === goblin.templateId)).toEqual({
      templateId: goblin.templateId,
      name: 'Goblin',
      role: 'creature',
      hp: 7,
      cr: '1/4',
      creatureType: 'humanoid',
      size: 'small',
      inParty: false,
      featuredNpc: false,
      source: 'homebrew',
      imported: false,
      locallyEdited: false,
    });
    expect(summaries.find(item => item.templateId === aria.templateId)).toMatchObject({ role: 'pc', inParty: true, size: 'medium' });
  });

  test('an update is reflected in the next summary read', async () => {
    const { http, gm, mara } = await setup();
    await asToken(http.put(`/api/dnd5e/entities/${mara.templateId}`), gm.token)
      .send({ data: { ...mara, creatureType: 'fey', size: 'small' } })
      .expect(200);

    const response = await asToken(http.get('/api/dnd5e/entities/summary'), gm.token).expect(200);
    const summaries = (response.body as { entities: DnD5eEntitySummary[] }).entities;
    expect(summaries.find(item => item.templateId === mara.templateId)).toMatchObject({ creatureType: 'fey', size: 'small' });
  });
});

describe('featured NPCs', () => {
  const summaryOf = async (http: ReturnType<typeof createHttpAgent>, token: string, id: number) => {
    const response = await asToken(http.get('/api/dnd5e/entities/summary'), token).expect(200);
    return (response.body as { entities: DnD5eEntitySummary[] }).entities.find(item => item.templateId === id);
  };

  test('only an NPC with the featured setting is a featured NPC in the summary list', async () => {
    const { http, gm, create } = await setup();
    const nyx = await create(baseEntity('Nyx', { role: 'npc', settings: { compendium: { featured: true } } }));
    const wolf = await create(baseEntity('Wolf', { settings: { compendium: { featured: true } } }));
    const pc = await create(baseEntity('Kael', { role: 'pc', settings: { compendium: { featured: true } } }));

    expect(await summaryOf(http, gm.token, nyx.templateId)).toMatchObject({ role: 'npc', featuredNpc: true });
    expect(await summaryOf(http, gm.token, wolf.templateId)).toMatchObject({ role: 'creature', featuredNpc: false });
    expect(await summaryOf(http, gm.token, pc.templateId)).toMatchObject({ role: 'pc', featuredNpc: false });
  });

  test('featuring an NPC through a full save keeps its other settings and its assigned player', async () => {
    const { http, gm, player, mara } = await setup();
    const withDeathSaves = { ...mara, settings: { combat: { deathSaves: true } } };
    await asToken(http.put(`/api/dnd5e/entities/${mara.templateId}`), gm.token).send({ data: withDeathSaves }).expect(200);

    await asToken(http.put(`/api/dnd5e/entities/${mara.templateId}`), gm.token)
      .send({ data: { ...withDeathSaves, settings: { combat: { deathSaves: true }, compendium: { featured: true } } } })
      .expect(200);

    expect(await summaryOf(http, gm.token, mara.templateId)).toMatchObject({ featuredNpc: true });
    const detail = await asToken(http.get(`/api/dnd5e/entities/${mara.templateId}`), gm.token).expect(200);
    expect((detail.body as { entity: DnD5eEntityDetails }).entity).toMatchObject({
      settings: { combat: { deathSaves: true }, compendium: { featured: true } },
      controllerUserIds: [player.user.id],
    });
  });

  test('a featured NPC changed to a creature is no longer featured, and changing it back restores it', async () => {
    const { http, gm, create } = await setup();
    const nyx = await create(baseEntity('Nyx', { role: 'npc', settings: { compendium: { featured: true } } }));
    const save = (role: NewEntity['role']) =>
      asToken(http.put(`/api/dnd5e/entities/${nyx.templateId}`), gm.token).send({ data: { ...nyx, role } }).expect(200);

    await save('creature');
    expect(await summaryOf(http, gm.token, nyx.templateId)).toMatchObject({ featuredNpc: false });
    await save('npc');
    expect(await summaryOf(http, gm.token, nyx.templateId)).toMatchObject({ featuredNpc: true });
  });

  test('a setting outside the schema is rejected', async () => {
    const { http, gm, mara } = await setup();
    const response = await asToken(http.put(`/api/dnd5e/entities/${mara.templateId}`), gm.token)
      .send({ data: { ...mara, settings: { compendium: { featured: 'yes' } } } });
    expect(response.status).toBe(400);
  });
});

describe('assigned player characters', () => {
  test('a player lists exactly their assigned PCs, including one outside the party', async () => {
    const { http, player, bram } = await setup();

    const response = await asToken(http.get('/api/dnd5e/entities/mine'), player.token).expect(200);
    expect((response.body as { entities: DnD5eEntitySummary[] }).entities).toEqual([
      expect.objectContaining({ templateId: bram.templateId, name: 'Bram', role: 'pc', inParty: false }),
    ]);
  });

  test('a player reads their assigned PC in the entity-detail shape', async () => {
    const { http, player, bram } = await setup();

    const response = await asToken(http.get(`/api/dnd5e/entities/mine/${bram.templateId}`), player.token).expect(200);
    expect((response.body as { entity: DnD5eEntityDetails }).entity).toMatchObject({
      templateId: bram.templateId,
      name: 'Bram',
      role: 'pc',
      hp: 33,
      controllerUserIds: [player.user.id],
    });
  });

  test("an assigned NPC, another player's PC and a missing ID are the same 404", async () => {
    const { http, player, aria, mara } = await setup();

    const responses = await Promise.all([mara.templateId, aria.templateId, 999_999].map(id =>
      asToken(http.get(`/api/dnd5e/entities/mine/${id}`), player.token).expect(404)));
    const bodies = responses.map(response => response.body as unknown);
    expect(bodies[0]).toEqual({ message: expect.any(String) });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  test('the other player sees only their own PC, and a GM with no assignments sees none', async () => {
    const { http, gm, other, aria, bram } = await setup();

    const mine = await asToken(http.get('/api/dnd5e/entities/mine'), other.token).expect(200);
    expect((mine.body as { entities: DnD5eEntitySummary[] }).entities.map(item => item.templateId)).toEqual([aria.templateId]);
    await asToken(http.get(`/api/dnd5e/entities/mine/${bram.templateId}`), other.token).expect(404);

    const gmMine = await asToken(http.get('/api/dnd5e/entities/mine'), gm.token).expect(200);
    expect((gmMine.body as { entities: DnD5eEntitySummary[] }).entities).toEqual([]);
  });

  test('unassigning a PC removes it from the list and its sheet', async () => {
    const { http, gm, player, bram } = await setup();
    await asToken(http.put(`/api/dnd5e/entities/${bram.templateId}/controllers`), gm.token).send({ userIds: [] }).expect(200);

    const response = await asToken(http.get('/api/dnd5e/entities/mine'), player.token).expect(200);
    expect((response.body as { entities: DnD5eEntitySummary[] }).entities).toEqual([]);
    await asToken(http.get(`/api/dnd5e/entities/mine/${bram.templateId}`), player.token).expect(404);
  });

  test('changing an assigned PC to an NPC removes it from the list and its sheet', async () => {
    const { http, gm, player, bram } = await setup();
    await asToken(http.put(`/api/dnd5e/entities/${bram.templateId}`), gm.token)
      .send({ data: { ...bram, role: 'npc' } })
      .expect(200);

    const response = await asToken(http.get('/api/dnd5e/entities/mine'), player.token).expect(200);
    expect((response.body as { entities: DnD5eEntitySummary[] }).entities).toEqual([]);
    await asToken(http.get(`/api/dnd5e/entities/mine/${bram.templateId}`), player.token).expect(404);
  });

  test('both reads need a signed-in user, and a malformed ID is a 400', async () => {
    const { http, player, bram } = await setup();

    expect((await http.get('/api/dnd5e/entities/mine')).status).toBe(401);
    expect((await http.get(`/api/dnd5e/entities/mine/${bram.templateId}`)).status).toBe(401);
    expect((await asToken(http.get('/api/dnd5e/entities/mine/abc'), player.token)).status).toBe(400);
  });
});

describe('inventory', () => {
  const potions = [
    { name: 'Potion of healing', quantity: 2, notes: 'From the temple' },
    { name: 'Iron key', quantity: 1, notes: 'Opens the crypt' },
    { name: 'Potion of healing', quantity: 1 },
  ];
  type Http = ReturnType<typeof createHttpAgent>;
  const read = (http: Http, token: string, id: number) => asToken(http.get(`/api/dnd5e/entities/${id}/inventory`), token);
  const write = (http: Http, token: string, id: number, body: unknown) =>
    asToken(http.put(`/api/dnd5e/entities/${id}/inventory`), token).send(body as object);

  test('a PC with no stored inventory reads as an empty list', async () => {
    const { http, gm, bram } = await setup();
    const response = await read(http, gm.token, bram.templateId).expect(200);
    expect(response.body).toEqual({ items: [], revision: 0 });
  });

  test('a GM saves a list and reads it back in order, duplicates kept, text trimmed', async () => {
    const { http, gm, bram } = await setup();
    const sent = [{ ...potions[0], name: '  Potion of healing ', notes: ' From the temple ' }, potions[1], { ...potions[2], notes: '   ' }];

    const saved = await write(http, gm.token, bram.templateId, { items: sent }).expect(200);
    expect(saved.body).toEqual({ items: potions, revision: 1 });
    expect((await read(http, gm.token, bram.templateId).expect(200)).body.items).toEqual(potions);
  });

  test('the assigned player reads their PC inventory; another player and a player PUT cannot reach it', async () => {
    const { http, gm, player, other, bram } = await setup();
    await write(http, gm.token, bram.templateId, { items: potions }).expect(200);

    expect((await read(http, player.token, bram.templateId).expect(200)).body.items).toEqual(potions);
    const unassigned = await read(http, other.token, bram.templateId).expect(404);
    const missing = await read(http, other.token, 999_999).expect(404);
    expect(unassigned.body).toEqual(missing.body);
    await write(http, player.token, bram.templateId, { items: [] }).expect(403);
    expect((await read(http, gm.token, bram.templateId).expect(200)).body.items).toEqual(potions);
  });

  test('a featured NPC has an inventory for the GM only, even when the NPC is assigned to a player', async () => {
    const { http, gm, player, mara } = await setup();
    await write(http, gm.token, mara.templateId, { items: potions }).expect(404);

    await asToken(http.put(`/api/dnd5e/entities/${mara.templateId}`), gm.token)
      .send({ data: { ...mara, settings: { compendium: { featured: true } } } }).expect(200);
    await write(http, gm.token, mara.templateId, { items: potions }).expect(200);

    expect((await read(http, gm.token, mara.templateId).expect(200)).body.items).toEqual(potions);
    await read(http, player.token, mara.templateId).expect(404);
  });

  test('ordinary NPCs, creatures and missing entities have no inventory to read or write', async () => {
    const { http, gm, mara, create } = await setup();
    const wolf = await create(baseEntity('Wolf'));

    const statuses: number[] = [];
    for (const id of [mara.templateId, wolf.templateId, 999_999]) {
      statuses.push((await read(http, gm.token, id)).status, (await write(http, gm.token, id, { items: potions })).status);
    }
    expect(statuses).toEqual([404, 404, 404, 404, 404, 404]);
  });

  test('an invalid list is a 400 and leaves the saved inventory unchanged', async () => {
    const { http, gm, bram } = await setup();
    await write(http, gm.token, bram.templateId, { items: potions }).expect(200);

    const invalid: unknown[] = [
      { items: [...potions, { name: 'Rope', quantity: 0 }] },
      { items: [{ name: 'Rope', quantity: 1.5 }] },
      { items: [{ name: 'Rope', quantity: '2' }] },
      { items: [{ name: 'Rope', quantity: Number.MAX_SAFE_INTEGER + 1 }] },
      { items: [{ name: '   ', quantity: 1 }] },
      { items: [{ name: 'Rope', quantity: 1, notes: 5 }] },
      { items: 'Rope' },
      {},
    ];
    for (const body of invalid) {
      await write(http, gm.token, bram.templateId, body).expect(400);
    }
    expect((await read(http, gm.token, bram.templateId).expect(200)).body.items).toEqual(potions);
  });

  test('removing Featured or the PC role hides the inventory, and restoring eligibility brings the same items back', async () => {
    const { http, gm, player, bram, create } = await setup();
    const nyx = await create(baseEntity('Nyx', { role: 'npc', settings: { compendium: { featured: true } } }));
    await write(http, gm.token, nyx.templateId, { items: potions }).expect(200);
    await write(http, gm.token, bram.templateId, { items: potions.slice(0, 1) }).expect(200);
    const save = (entity: DnD5eEntityDetails) =>
      asToken(http.put(`/api/dnd5e/entities/${entity.templateId}`), gm.token).send({ data: entity }).expect(200);

    await save({ ...nyx, settings: { compendium: { featured: false } } });
    await read(http, gm.token, nyx.templateId).expect(404);
    await write(http, gm.token, nyx.templateId, { items: [] }).expect(404);
    await save(nyx);
    expect((await read(http, gm.token, nyx.templateId).expect(200)).body.items).toEqual(potions);

    await save({ ...bram, role: 'creature' });
    await read(http, player.token, bram.templateId).expect(404);
    await save(bram);
    expect((await read(http, player.token, bram.templateId).expect(200)).body.items).toEqual(potions.slice(0, 1));
  });

  test('a full template save keeps the inventory, and template reads carry no inventory', async () => {
    const { http, gm, player, bram } = await setup();
    await write(http, gm.token, bram.templateId, { items: potions }).expect(200);

    const updated = await asToken(http.put(`/api/dnd5e/entities/${bram.templateId}`), gm.token)
      .send({ data: { ...bram, ac: 17 } }).expect(200);
    expect((updated.body as { entity: DnD5eEntityDetails }).entity.ac).toBe(17);
    expect((await read(http, gm.token, bram.templateId).expect(200)).body.items).toEqual(potions);

    const reads = [
      updated,
      await asToken(http.get(`/api/dnd5e/entities/${bram.templateId}`), gm.token).expect(200),
      await asToken(http.post('/api/dnd5e/entities/batch'), gm.token).send({ entityIds: [bram.templateId] }).expect(200),
      await asToken(http.get('/api/dnd5e/entities/summary'), gm.token).expect(200),
      await asToken(http.get(`/api/dnd5e/entities/mine/${bram.templateId}`), player.token).expect(200),
    ];
    for (const response of reads) {
      expect(JSON.stringify(response.body)).not.toContain('Potion of healing');
    }
  });

  test('inventory needs a signed-in user, and a malformed ID is a 400', async () => {
    const { http, gm, bram } = await setup();
    expect((await http.get(`/api/dnd5e/entities/${bram.templateId}/inventory`)).status).toBe(401);
    expect((await read(http, gm.token, Number.NaN)).status).toBe(400);
  });
});
