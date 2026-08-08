import { describe, expect, test } from 'vitest';
import type { DnD5eEntityDetails, DnD5eEntitySummary } from 'shared/domain/encounters/dnd5e/entity.js';
import { createGm, createPlayer } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

type NewEntity = Omit<DnD5eEntityDetails, 'templateId' | 'createdAt'>;

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
