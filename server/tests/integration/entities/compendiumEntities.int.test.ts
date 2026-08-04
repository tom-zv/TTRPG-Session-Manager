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
