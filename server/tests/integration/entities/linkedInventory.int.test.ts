import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { describe, expect, test, vi } from 'vitest';
import type { DnD5eEntityDetails } from 'shared/domain/encounters/dnd5e/entity.js';
import type { DnD5eInventory, DnD5eInventoryConflict } from 'shared/domain/encounters/dnd5e/inventory.js';
import type { Item, ItemInput, ItemListResult } from 'shared/domain/dnd5e/item.js';
import { dnd5ePool } from '../../../src/db.js';
import { import5eToolsItems } from '../../../src/services/5etools/5eToolsItemImportService.js';
import { buildItemImportPlan } from '../../../src/utils/5etools/item-transformer.js';
import { itemSources } from '../../fixtures/5eToolsItems.js';
import { createGm, createPlayer } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

type NewEntity = Omit<DnD5eEntityDetails, 'templateId' | 'createdAt'>;

const entity = (name: string, patch: Partial<NewEntity> = {}): NewEntity => ({
  name,
  role: 'pc',
  ac: 12,
  hp: 20,
  speeds: { walk: 30 },
  size: 'medium',
  alignment: 'neutral',
  abilityScores: { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
  ...patch,
});

const homebrew = (name: string): ItemInput => ({
  name,
  source: 'HB',
  category: 'wondrous item',
  rarity: 'rare',
  requiresAttunement: false,
  aliases: [],
  details: { description: `${name} hums.` },
});

async function setup() {
  const http = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const other = await createPlayer();

  const create = async (data: NewEntity): Promise<DnD5eEntityDetails> =>
    ((await asToken(http.post('/api/dnd5e/entities'), gm.token).send({ data }).expect(201)).body as { entity: DnD5eEntityDetails }).entity;
  const bram = await create(entity('Bram'));
  await asToken(http.put(`/api/dnd5e/entities/${bram.templateId}/controllers`), gm.token).send({ userIds: [player.user.id] }).expect(200);

  const createItem = async (name: string): Promise<Item> =>
    ((await asToken(http.post('/api/dnd5e/items'), gm.token).send(homebrew(name)).expect(201)).body as { item: Item }).item;
  const hide = (id: number, hidden = true) =>
    asToken(http.put(`/api/dnd5e/items/${id}/visibility`), gm.token).send({ hidden }).expect(200);
  const removeItem = (id: number) => asToken(http.delete(`/api/dnd5e/items/${id}`), gm.token).expect(204);

  const url = (id: number) => `/api/dnd5e/entities/${id}/inventory`;
  const read = (token: string, id = bram.templateId) => asToken(http.get(url(id)), token);
  const readBody = async (token: string, id = bram.templateId) => (await read(token, id).expect(200)).body as DnD5eInventory;
  const replace = (body: unknown, id = bram.templateId, token = gm.token) => asToken(http.put(url(id)), token).send(body as object);
  const append = (body: unknown, id = bram.templateId, token = gm.token) => asToken(http.post(`${url(id)}/items`), token).send(body as object);

  return { http, gm, player, other, bram, create, createItem, hide, removeItem, read, readBody, replace, append };
}

// Import the fixture catalog and find an item by name and source, as the GM sees it.
async function importCatalog(http: ReturnType<typeof createHttpAgent>, gmToken: string) {
  await import5eToolsItems(buildItemImportPlan(itemSources()), { revision: 'fixture' });
  const all = (await asToken(http.get('/api/dnd5e/items?specifics=true&limit=100'), gmToken).expect(200)).body as ItemListResult;
  return (name: string, source: string) => {
    const found = all.items.find(item => item.name === name && item.source === source);
    if (!found) throw new Error(`${name}|${source} was not imported`);
    return found;
  };
}

// Reserve the next pool connection the app checks out, so a test can pause it at a known statement.
async function pauseAfterStatement<T>(sql: string, whilePaused: () => Promise<void>, request: () => Promise<T>): Promise<T> {
  const connection: PoolConnection = await dnd5ePool.getConnection();
  let checkedOut = false;
  const checkout = vi.spyOn(dnd5ePool, 'getConnection').mockImplementationOnce(async () => {
    checkedOut = true;
    return connection;
  });
  const execute = connection.execute.bind(connection);
  let reached = false;
  const barrier = vi.spyOn(connection, 'execute').mockImplementation((async (statement: string, values?: unknown) => {
    const result = await execute(statement, values as never);
    if (!reached && String(statement).includes(sql)) {
      reached = true;
      await whilePaused();
    }
    return result;
  }) as typeof connection.execute);
  try {
    const result = await request();
    expect(reached).toBe(true);
    return result;
  } finally {
    barrier.mockRestore();
    checkout.mockRestore();
    if (!checkedOut) connection.release();
  }
}

// Resolves once some transaction waits for a row lock, or once `settled` is true (no lock was needed).
async function untilBlockedOrSettled(settled: () => boolean): Promise<void> {
  await vi.waitFor(async () => {
    if (settled()) return;
    const [rows] = await dnd5ePool.query<RowDataPacket[]>('SELECT COUNT(*) AS waiting FROM performance_schema.data_lock_waits');
    expect(Number(rows[0].waiting)).toBeGreaterThan(0);
  }, { timeout: 5000, interval: 20 });
}

// The statement that locks the entity row for an inventory write.
const LOCK_SQL = 'FROM dnd5e.entities e WHERE e.id = ?';

describe('legacy and linked rows', () => {
  test('a stored free-text list from before links reads as revision 0 and saves unchanged without expectedRevision', async () => {
    const { bram, gm, player, readBody, replace } = await setup();
    const legacy = [{ name: 'Iron key', quantity: 1, notes: 'Opens the crypt' }, { name: 'Rope', quantity: 2 }];
    await dnd5ePool.execute('UPDATE dnd5e.entities SET inventory = ?, inventory_revision = NULL WHERE id = ?', [JSON.stringify(legacy), bram.templateId]);

    expect(await readBody(gm.token)).toEqual({ items: legacy, revision: 0 });
    expect(await readBody(player.token)).toEqual({ items: legacy, revision: 0 });
    const saved = (await replace({ items: legacy }).expect(200)).body as DnD5eInventory;
    expect(saved).toEqual({ items: legacy, revision: 1 });
  });

  test('a GM links a row to a concrete item; both viewers see its current name while the saved label stays', async () => {
    const { gm, player, createItem, readBody, replace, http } = await setup();
    const lantern = await createItem('Whispering Lantern');
    await replace({ items: [{ name: 'Old lamp', quantity: 1, itemId: lantern.id }, { name: 'Rope', quantity: 1 }] }).expect(200);

    const linked = { name: 'Old lamp', quantity: 1, itemId: lantern.id, item: { name: 'Whispering Lantern', source: 'HB' } };
    expect((await readBody(gm.token)).items).toEqual([linked, { name: 'Rope', quantity: 1 }]);
    expect((await readBody(player.token)).items).toEqual([linked, { name: 'Rope', quantity: 1 }]);

    await asToken(http.put(`/api/dnd5e/items/${lantern.id}`), gm.token).send(homebrew('Hushing Lantern')).expect(200);
    expect((await readBody(player.token)).items[0]).toEqual({ ...linked, item: { name: 'Hushing Lantern', source: 'HB' } });
  });

  test('a link to a missing, deleted, family or group item is a 400 naming the row, and nothing is written', async () => {
    const { http, gm, createItem, removeItem, readBody, replace } = await setup();
    const find = await importCatalog(http, gm.token);
    const gone = await createItem('Lost Ring');
    await removeItem(gone.id);
    await replace({ items: [{ name: 'Rope', quantity: 1 }] }).expect(200);

    for (const itemId of [999_999, gone.id, find('+1 Weapon', 'DMG').id, find('Armor of Resistance', 'DMG').id]) {
      const response = await replace({ items: [{ name: 'Rope', quantity: 1 }, { name: 'Thing', quantity: 1, itemId }] }).expect(400);
      expect((response.body as { message: string }).message).toMatch(/^Item 2:/);
    }
    expect(await readBody(gm.token)).toEqual({ items: [{ name: 'Rope', quantity: 1 }], revision: 1 });
  });
});

describe('hidden and deleted catalog items', () => {
  test('a hidden linked item keeps its label, quantity and notes for the player but withholds its link', async () => {
    const { gm, player, createItem, hide, readBody, replace } = await setup();
    const lantern = await createItem('Whispering Lantern');
    await replace({ items: [{ name: 'Strange lamp', quantity: 2, notes: 'Warm', itemId: lantern.id }] }).expect(200);
    await hide(lantern.id);

    const playerView = await readBody(player.token);
    expect(playerView.items).toEqual([{ name: 'Strange lamp', quantity: 2, notes: 'Warm' }]);
    expect(JSON.stringify(playerView)).not.toContain('Whispering');
    expect(JSON.stringify(playerView)).not.toContain('itemId');
    expect((await readBody(gm.token)).items).toEqual([
      { name: 'Strange lamp', quantity: 2, notes: 'Warm', itemId: lantern.id, item: { name: 'Whispering Lantern', source: 'HB', hidden: true } },
    ]);

    await hide(lantern.id, false);
    expect((await readBody(player.token)).items[0].item).toEqual({ name: 'Whispering Lantern', source: 'HB' });
  });

  test('hiding a magic variant family hides its specific in the inventory from the player only', async () => {
    const { http, gm, player, hide, readBody, append } = await setup();
    const find = await importCatalog(http, gm.token);
    const specific = find('+1 Longsword', 'DMG');
    await append({ itemId: specific.id, quantity: 1 }).expect(201);
    await hide(find('+1 Weapon', 'DMG').id);

    expect((await readBody(player.token)).items).toEqual([{ name: '+1 Longsword', quantity: 1 }]);
    expect((await readBody(gm.token)).items[0]).toEqual({
      name: '+1 Longsword', quantity: 1, itemId: specific.id, item: { name: '+1 Longsword', source: 'DMG', hidden: true },
    });
  });

  test('a deleted item stays linked for the GM as history, unresolved, and an editor round trip keeps it', async () => {
    const { gm, player, createItem, removeItem, readBody, replace } = await setup();
    const ring = await createItem('Lost Ring');
    await replace({ items: [{ name: 'Ring', quantity: 1, itemId: ring.id }] }).expect(200);
    await removeItem(ring.id);

    const gmView = await readBody(gm.token);
    expect(gmView.items).toEqual([{ name: 'Ring', quantity: 1, itemId: ring.id }]);
    expect((await readBody(player.token)).items).toEqual([{ name: 'Ring', quantity: 1 }]);

    // The GM's editor sends back what it read, with a quantity change.
    const saved = (await replace({ items: [{ ...gmView.items[0], quantity: 3 }], expectedRevision: gmView.revision }).expect(200)).body as DnD5eInventory;
    expect(saved.items).toEqual([{ name: 'Ring', quantity: 3, itemId: ring.id }]);
  });

  // 06-F001
  test('a deleted item stays linked only as often as it was: rows may move or detach, but another link is a 400', async () => {
    const { gm, createItem, removeItem, readBody, replace } = await setup();
    const ring = await createItem('Lost Ring');
    await replace({ items: [{ name: 'Ring', quantity: 1, itemId: ring.id }, { name: 'Ring', quantity: 2, itemId: ring.id }] }).expect(200);
    await removeItem(ring.id);

    // Both historical links survive a reorder with a new free-text row between them.
    const moved = [{ name: 'Ring', quantity: 2, itemId: ring.id }, { name: 'Rope', quantity: 1 }, { name: 'Ring', quantity: 1, itemId: ring.id }];
    await replace({ items: moved, expectedRevision: 1 }).expect(200);

    const third = await replace({ items: [...moved, { name: 'Ring', quantity: 3, itemId: ring.id }], expectedRevision: 2 }).expect(400);
    expect(third.body).toEqual({ message: 'Item 4: the linked catalog item is not available' });
    expect(await readBody(gm.token)).toEqual({ items: moved, revision: 2 });

    // Detaching one spends that link: it cannot come back.
    const detached = [moved[0], moved[1], { name: 'Ring', quantity: 1 }];
    await replace({ items: detached, expectedRevision: 2 }).expect(200);
    const relink = await replace({ items: [moved[0], moved[1], moved[2]], expectedRevision: 3 }).expect(400);
    expect(relink.body).toEqual({ message: 'Item 3: the linked catalog item is not available' });
    expect((await readBody(gm.token)).revision).toBe(3);
  });
});

describe('appending a catalog item', () => {
  test('a GM appends a concrete item under its current name; the revision moves on and the rest of the list stays', async () => {
    const { gm, createItem, readBody, replace, append } = await setup();
    const lantern = await createItem('Whispering Lantern');
    await replace({ items: [{ name: 'Rope', quantity: 1 }] }).expect(200);

    const response = await append({ itemId: lantern.id, quantity: 2, notes: ' Lit ' }).expect(201);
    const expected = {
      items: [{ name: 'Rope', quantity: 1 }, { name: 'Whispering Lantern', quantity: 2, notes: 'Lit', itemId: lantern.id, item: { name: 'Whispering Lantern', source: 'HB' } }],
      revision: 2,
    };
    expect(response.body).toEqual(expected);
    expect(await readBody(gm.token)).toEqual(expected);
  });

  test('a GM can give a hidden item; deleted, family and missing items are 404 and nothing is written', async () => {
    const { http, gm, createItem, hide, removeItem, readBody, append } = await setup();
    const find = await importCatalog(http, gm.token);
    const secret = await createItem('Secret Blade');
    await hide(secret.id);
    await append({ itemId: secret.id, quantity: 1 }).expect(201);

    const gone = await createItem('Lost Ring');
    await removeItem(gone.id);
    for (const itemId of [gone.id, find('+1 Weapon', 'DMG').id, 999_999]) {
      const response = await append({ itemId, quantity: 1 }).expect(404);
      expect(response.body).toEqual({ message: 'Item not found' });
    }
    expect((await readBody(gm.token)).revision).toBe(1);
  });

  test('only a GM appends, only to a PC or featured NPC, with a valid body, below the list limit', async () => {
    const { gm, player, bram, create, createItem, append, replace, readBody } = await setup();
    const lantern = await createItem('Whispering Lantern');
    const wolf = await create(entity('Wolf', { role: 'creature' }));
    const mara = await create(entity('Mara', { role: 'npc' }));

    await append({ itemId: lantern.id, quantity: 1 }, bram.templateId, player.token).expect(403);
    for (const id of [wolf.templateId, mara.templateId, 999_999]) {
      expect((await append({ itemId: lantern.id, quantity: 1 }, id).expect(404)).body).toEqual({ message: 'Inventory not found' });
    }
    for (const body of [{ quantity: 1 }, { itemId: lantern.id, quantity: 0 }, { itemId: 'x', quantity: 1 }, []]) {
      await append(body).expect(400);
    }

    const full = Array.from({ length: 500 }, (_, index) => ({ name: `Pebble ${index + 1}`, quantity: 1 }));
    await replace({ items: full }).expect(200);
    await append({ itemId: lantern.id, quantity: 1 }).expect(400);
    const after = await readBody(gm.token);
    expect(after.items).toHaveLength(500);
    expect(after.revision).toBe(1);
  });

  test('two concurrent appends both survive, in the order they took the lock', async () => {
    const { gm, createItem, readBody, append } = await setup();
    const lantern = await createItem('Whispering Lantern');
    const ring = await createItem('Lost Ring');

    let second: Promise<unknown> | undefined;
    let secondDone = false;
    // The first append holds the entity's row lock; the second starts and must wait for it.
    await pauseAfterStatement(LOCK_SQL, async () => {
      second = append({ itemId: ring.id, quantity: 1 }).expect(201).then(() => { secondDone = true; });
      await untilBlockedOrSettled(() => secondDone);
    }, () => append({ itemId: lantern.id, quantity: 1 }).expect(201));
    await second;

    const final = await readBody(gm.token);
    expect(final.items.map(row => row.name)).toEqual(['Whispering Lantern', 'Lost Ring']);
    expect(final.revision).toBe(2);
  });
});

describe('revision-checked replacement', () => {
  // 06-F002. A client may send any text escaped as \uXXXX, which is the largest encoding of a valid row.
  const escaped = (body: unknown) => JSON.stringify(body).replace(/[\u0080-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const sendRaw = (request: ReturnType<ReturnType<typeof createHttpAgent>['put']>, body: string) =>
    request.set('Content-Type', 'application/json').send(body);

  test('a full inventory grown through appends round-trips through a revision-checked replacement; a larger body is a 413', async () => {
    const { http, gm, bram, createItem, readBody, append } = await setup();
    const lantern = await createItem('Whispering Lantern');
    const url = `/api/dnd5e/entities/${bram.templateId}/inventory`;
    const row = (index: number) => ({ name: `${index}`.padEnd(255, 'é'), quantity: 1, notes: 'é'.repeat(2000) });
    const rows = Array.from({ length: 498 }, (_, index) => row(index + 1));

    await sendRaw(asToken(http.put(url), gm.token), escaped({ items: rows, expectedRevision: 0 })).expect(200);
    await append({ itemId: lantern.id, quantity: 1, notes: 'é'.repeat(2000) }).expect(201);
    await append({ itemId: lantern.id, quantity: 2 }).expect(201);

    const grown = await readBody(gm.token);
    expect(grown.items).toHaveLength(500);
    expect(grown.revision).toBe(3);
    // The editor sends every row back, links included, under the revision it read.
    const writeShaped = grown.items.map(({ item: _item, ...entry }) => entry);
    const body = escaped({ items: writeShaped, expectedRevision: 3 });
    expect(body.length).toBeGreaterThan(6_000_000);
    const saved = (await sendRaw(asToken(http.put(url), gm.token), body).expect(200)).body as DnD5eInventory;
    expect(saved.revision).toBe(4);
    expect(saved.items.slice(-2).map(entry => entry.itemId)).toEqual([lantern.id, lantern.id]);

    const tooLarge = await sendRaw(asToken(http.put(url), gm.token), body + ' '.repeat(1_000_000)).expect(413);
    expect(tooLarge.body).toEqual({ message: 'Inventory request body is too large.' });
    expect((await readBody(gm.token)).revision).toBe(4);
  });

  test('the append route keeps the default body limit', async () => {
    const { http, gm, bram, createItem, readBody } = await setup();
    const lantern = await createItem('Whispering Lantern');
    const padded = JSON.stringify({ itemId: lantern.id, quantity: 1 }) + ' '.repeat(150_000);
    const response = await asToken(http.post(`/api/dnd5e/entities/${bram.templateId}/inventory/items`), gm.token)
      .set('Content-Type', 'application/json').send(padded);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await readBody(gm.token)).revision).toBe(0);
  });

  test('a stale expectedRevision is a 409 with the stored list and revision, and writes nothing', async () => {
    const { gm, createItem, readBody, replace, append } = await setup();
    const lantern = await createItem('Whispering Lantern');
    const loaded = (await replace({ items: [{ name: 'Rope', quantity: 1 }] }).expect(200)).body as DnD5eInventory;
    // An item page gives the character something after the sheet's editor loaded revision 1.
    await append({ itemId: lantern.id, quantity: 1 }).expect(201);

    const stale = await replace({ items: [], expectedRevision: loaded.revision }).expect(409);
    const current = await readBody(gm.token);
    expect(current.revision).toBe(2);
    expect(current.items.map(row => row.name)).toEqual(['Rope', 'Whispering Lantern']);
    const conflict = stale.body as DnD5eInventoryConflict;
    expect(conflict.message).toEqual(expect.any(String));
    expect({ items: conflict.items, revision: conflict.revision }).toEqual(current);
  });

  test('a matching expectedRevision replaces the list and increments the revision', async () => {
    const { gm, readBody, replace } = await setup();
    await replace({ items: [{ name: 'Rope', quantity: 1 }] }).expect(200);
    const saved = (await replace({ items: [{ name: 'Torch', quantity: 3 }], expectedRevision: 1 }).expect(200)).body as DnD5eInventory;
    expect(saved).toEqual({ items: [{ name: 'Torch', quantity: 3 }], revision: 2 });
    expect(await readBody(gm.token)).toEqual(saved);
  });

  test('an append that waits on a replacement lands after it, so the replacement cannot erase it', async () => {
    const { gm, createItem, readBody, replace, append } = await setup();
    const lantern = await createItem('Whispering Lantern');

    let appended: Promise<unknown> | undefined;
    let appendDone = false;
    await pauseAfterStatement(LOCK_SQL, async () => {
      appended = append({ itemId: lantern.id, quantity: 1 }).expect(201).then(() => { appendDone = true; });
      await untilBlockedOrSettled(() => appendDone);
    }, () => replace({ items: [{ name: 'Torch', quantity: 1 }], expectedRevision: 0 }).expect(200));
    await appended;

    const final = await readBody(gm.token);
    expect(final.items.map(row => row.name)).toEqual(['Torch', 'Whispering Lantern']);
    expect(final.revision).toBe(2);
  });

  test('a malformed expectedRevision is a 400; a player cannot replace; a template save keeps list and revision', async () => {
    const { http, gm, player, bram, readBody, replace } = await setup();
    await replace({ items: [{ name: 'Rope', quantity: 1 }] }).expect(200);
    for (const expectedRevision of [null, -1, '1', 1.5]) {
      await replace({ items: [], expectedRevision }).expect(400);
    }
    await replace({ items: [], expectedRevision: 1 }, bram.templateId, player.token).expect(403);

    await asToken(http.put(`/api/dnd5e/entities/${bram.templateId}`), gm.token).send({ data: { ...bram, ac: 18 } }).expect(200);
    expect(await readBody(gm.token)).toEqual({ items: [{ name: 'Rope', quantity: 1 }], revision: 1 });
  });
});
