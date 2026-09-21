import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { describe, expect, test, vi } from 'vitest';
import { ITEM_LIMITS } from 'shared/domain/dnd5e/item.js';
import type {
  Item,
  ItemInput,
  ItemListResult,
  ItemMembersResult,
  ItemResolveResult,
  ItemSummary,
} from 'shared/domain/dnd5e/item.js';
import { dnd5ePool } from '../../../src/db.js';
import { import5eToolsItems, type FiveEToolsItemImportOptions } from '../../../src/services/5etools/5eToolsItemImportService.js';
import { buildItemImportPlan } from '../../../src/utils/5etools/item-transformer.js';
import { itemSources } from '../../fixtures/5eToolsItems.js';
import { createGm, createPlayer } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

const REVISION = 'c3a5185c8f3fc8937725fdc4be249eb7120057c7';
const reimport = (options: Partial<FiveEToolsItemImportOptions> = {}) =>
  import5eToolsItems(buildItemImportPlan(itemSources()), { revision: REVISION, ...options });

const label = (item: Pick<ItemSummary, 'name' | 'source'>) => `${item.name}|${item.source}`;

// The GM form's snapshot of an item, as the editor would submit it.
const asInput = (item: Item): ItemInput => ({
  name: item.name,
  source: item.source,
  ...(item.page !== undefined ? { page: item.page } : {}),
  ...(item.category ? { category: item.category } : {}),
  rarity: item.rarity,
  requiresAttunement: item.requiresAttunement,
  ...(item.attunementNote ? { attunementNote: item.attunementNote } : {}),
  ...(item.valueCp !== undefined ? { valueCp: item.valueCp } : {}),
  ...(item.weightLb !== undefined ? { weightLb: item.weightLb } : {}),
  aliases: item.aliases,
  ...(item.base ? { baseItemId: item.base.id } : {}),
  details: item.details,
});

const homebrew = (patch: Partial<ItemInput> = {}): ItemInput => ({
  name: 'Whispering Lantern',
  source: 'SECRET',
  category: 'wondrous item',
  rarity: 'rare',
  requiresAttunement: false,
  aliases: ['Hush Lamp'],
  details: { description: 'It hums.' },
  ...patch,
});

async function setup() {
  await reimport();
  const http = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();

  const list = async (token: string, query = '') =>
    (await asToken(http.get(`/api/dnd5e/items${query}`), token).expect(200)).body as ItemListResult;
  const detail = (token: string, id: number) => asToken(http.get(`/api/dnd5e/items/${id}`), token);
  const members = async (token: string, id: number, query = '') =>
    (await asToken(http.get(`/api/dnd5e/items/${id}/members${query}`), token).expect(200)).body as ItemMembersResult;
  const resolve = async (token: string, refs: Array<{ name: string; source?: string }>) =>
    (await asToken(http.post('/api/dnd5e/items/resolve'), token).send({ refs }).expect(200)).body as ItemResolveResult;
  const hide = (id: number, hidden = true) =>
    asToken(http.put(`/api/dnd5e/items/${id}/visibility`), gm.token).send({ hidden }).expect(200);
  const create = async (input: ItemInput) =>
    ((await asToken(http.post('/api/dnd5e/items'), gm.token).send(input).expect(201)).body as { item: Item }).item;

  const everything = await list(gm.token, '?specifics=true&limit=100');
  const ids = new Map(everything.items.map(item => [label(item), item.id]));
  const id = (key: string) => {
    const found = ids.get(key);
    if (found === undefined) throw new Error(`${key} was not imported`);
    return found;
  };
  return { http, gm, player, list, detail, members, resolve, hide, create, id };
}

async function withNextCatalogConnection<T>(run: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await dnd5ePool.getConnection();
  let checkedOut = false;
  const checkout = vi.spyOn(dnd5ePool, 'getConnection').mockImplementationOnce(async () => {
    checkedOut = true;
    return connection;
  });
  try {
    return await run(connection);
  } finally {
    checkout.mockRestore();
    if (!checkedOut) connection.release();
  }
}

// Run real SQL on a reserved connection and interleave a separate request at a known boundary.
function afterCatalogQuery<T>(sql: string, interleave: () => Promise<void>, request: () => Promise<T>): Promise<T> {
  return withNextCatalogConnection(async connection => {
    const query = connection.query.bind(connection);
    let reached = false;
    const barrier = vi.spyOn(connection, 'query').mockImplementation(async (statement, values) => {
      const result = await query(statement, values);
      if (!reached && String(statement).includes(sql)) {
        reached = true;
        await interleave();
      }
      return result;
    });
    try {
      const result = await request();
      expect(reached).toBe(true);
      return result;
    } finally {
      barrier.mockRestore();
    }
  });
}

describe('item index', () => {
  test('the default browse leaves out generated specifics and pages through a stable name, source, id order', async () => {
    const { player, list } = await setup();
    const all = await list(player.token, '?limit=100');
    expect(all.total).toBe(19);
    expect(all.items.every(item => item.family === undefined)).toBe(true);
    const labels = all.items.map(label);
    expect(labels.indexOf('Longsword|PHB')).toBe(labels.indexOf('Longsword|XPHB') - 1);
    expect(labels.indexOf('+1 Weapon|DMG')).toBe(labels.indexOf('+1 Weapon|XDMG') - 1);
    expect([...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))).toEqual(labels);

    const pages: ItemSummary[] = [];
    for (let offset = 0; offset < all.total; offset += 4) {
      const page = await list(player.token, `?limit=4&offset=${offset}`);
      expect(page).toMatchObject({ total: 19, offset, limit: 4 });
      expect(page.items.length).toBeLessThanOrEqual(4);
      pages.push(...page.items);
    }
    expect(pages.map(item => item.id)).toEqual(all.items.map(item => item.id));
    expect(await list(player.token)).toMatchObject({ limit: null, items: { length: 19 } });
  });

  test('a page or filter outside the bounds is rejected', async () => {
    const { http, player } = await setup();
    const statuses: number[] = [];
    for (const query of ['limit=101', 'limit=0', 'offset=-1', 'offset=1.5', 'kinds=weapon', 'attunement=yes', `q=${'x'.repeat(129)}`]) {
      statuses.push((await asToken(http.get(`/api/dnd5e/items?${query}`), player.token)).status);
    }
    expect(statuses).toEqual(Array(7).fill(400));
    expect((await http.get('/api/dnd5e/items')).status).toBe(401);
  });

  test('selecting a comma-containing source facet includes that source literally', async () => {
    const { player, list, create } = await setup();
    const authored = await create(homebrew({ source: 'Coast, Vol 1' }));
    const catalog = await list(player.token);
    const selected = catalog.facets.sources.filter(source => source === authored.source || source === 'PHB');
    expect(selected).toEqual(['Coast, Vol 1', 'PHB']);
    const sources = new URLSearchParams(selected.map(source => ['sources', source]));
    const matches = await list(player.token, `?${sources}`);
    expect(matches.items.map(item => item.id)).toEqual(
      catalog.items.filter(item => selected.includes(item.source)).map(item => item.id),
    );
  });

  test('a player index uses one catalog state when a GM hides a matching item after the count', async () => {
    const { player, list, create, hide } = await setup();
    const item = await create(homebrew());
    const search = () => list(player.token, '?q=hush');
    const before = await search();
    expect(before).toMatchObject({ total: 1, items: [{ id: item.id }], facets: { sources: ['SECRET'] } });
    const overlapping = await afterCatalogQuery('COUNT(*)', async () => {
      await hide(item.id);
    }, search);
    expect(overlapping).toEqual(before);
    expect(await search()).toMatchObject({ total: 0, items: [], facets: { sources: [] } });
  });

  test('a search finds generated specifics by name and items by alias; the specifics filter reveals or excludes them', async () => {
    const { player, list } = await setup();
    const longswords = await list(player.token, '?q=LONGSWORD');
    expect(longswords.items.map(label)).toEqual([
      '+1 Longsword|DMG', '+1 Longsword|XDMG', 'Keen +1 Longsword|HB', 'Longsword|PHB', 'Longsword|XPHB',
    ]);
    const plusOne = longswords.items[0];
    expect(plusOne.family).toMatchObject({ name: '+1 Weapon', source: 'DMG' });
    expect(plusOne.base).toMatchObject({ name: 'Longsword', source: 'PHB' });

    expect((await list(player.token, '?q=stonecut')).items.map(label)).toEqual(['Stonemaker Blade|HB']);
    expect((await list(player.token, '?q=longsword&specifics=false')).items.map(label)).toEqual(['Longsword|PHB', 'Longsword|XPHB']);
    expect((await list(player.token, '?specifics=true&limit=100')).total).toBe(27);
    // LIKE wildcards in a search are literal text.
    expect((await list(player.token, '?q=%25')).total).toBe(0);
  });

  test('filters narrow by role, category, origin, rarity, source and attunement, and facets list the choices in scope', async () => {
    const { gm, player, list, create } = await setup();
    await create(homebrew({ source: 'HB', requiresAttunement: true }));

    expect((await list(player.token, '?kinds=family&limit=100')).items.map(label)).toEqual([
      '+1 Weapon|DMG', '+1 Weapon|XDMG', 'Armor of Fire Resistance|DMG', 'Barding|PHB', 'Keen +1 Weapon|HB', 'Silvered Ammunition|XDMG',
    ]);
    expect((await list(player.token, '?categories=heavy armor&kinds=concrete')).items.map(label)).toEqual(['Plate Armor|PHB']);
    expect((await list(player.token, '?origins=homebrew')).items.map(label)).toEqual(['Whispering Lantern|HB']);
    expect((await list(player.token, '?rarities=rare,very rare&attunement=true')).items.map(label)).toEqual([
      'Armor of Fire Resistance|DMG', 'Armor of Resistance|DMG', 'Stirring Dragon Vessel|FTD',
      'Stonemaker Blade|HB', 'Wakened Dragon Vessel|FTD', 'Whispering Lantern|HB',
    ]);
    expect((await list(player.token, '?sources=ftd&sources=xdmg')).items.map(label)).toEqual([
      '+1 Weapon|XDMG', 'Silvered Ammunition|XDMG', 'Slumbering Dragon Vessel|FTD', 'Stirring Dragon Vessel|FTD', 'Wakened Dragon Vessel|FTD',
    ]);

    // Facets ignore the filters themselves, so choosing one keeps the others available.
    const filtered = await list(gm.token, '?kinds=group');
    expect(filtered.facets).toEqual({
      kinds: ['concrete', 'family', 'group'],
      categories: ['melee weapon', 'ranged weapon', 'ammunition', 'heavy armor', 'gear', 'wondrous item'],
      origins: ['imported', 'homebrew'],
      rarities: ['none', 'uncommon', 'rare', 'very rare'],
      sources: ['DMG', 'FTD', 'HB', 'PHB', 'XDMG', 'XPHB'],
    });
    expect((await list(gm.token, '?q=vessel')).facets).toMatchObject({ kinds: ['concrete'], sources: ['FTD'] });
  });
});

describe('item visibility', () => {
  test('to a player a hidden item is the same as a missing one in detail, members, search, aliases, facets and resolve', async () => {
    const { http, gm, player, list, detail, resolve, hide, create } = await setup();
    const secret = await create(homebrew());
    await hide(secret.id);

    const hidden = await detail(player.token, secret.id).expect(404);
    const missing = await detail(player.token, 2_000_000).expect(404);
    expect(hidden.body).toEqual(missing.body);
    const hiddenMembers = await asToken(http.get(`/api/dnd5e/items/${secret.id}/members`), player.token).expect(404);
    expect(hiddenMembers.body).toEqual(missing.body);

    for (const query of ['?q=whispering', '?q=hush', '?sources=SECRET', '?origins=homebrew']) {
      expect(await list(player.token, query)).toMatchObject({ total: 0, items: [] });
    }
    const facets = (await list(player.token)).facets;
    expect(facets.sources).not.toContain('SECRET');
    expect(facets.origins).toEqual(['imported']);
    expect((await resolve(player.token, [{ name: 'Whispering Lantern' }, { name: 'hush lamp', source: 'secret' }])).results
      .map(result => result.item)).toEqual([null, null]);

    // The GM keeps seeing and managing it, marked hidden.
    const seen = (await detail(gm.token, secret.id).expect(200)).body as { item: Item };
    expect(seen.item.gm).toMatchObject({ hidden: true, hiddenByFamily: false });
    expect((await list(gm.token, '?q=hush')).items.map(item => item.gm)).toEqual([{ hidden: true, hiddenByFamily: false }]);
    expect((await resolve(gm.token, [{ name: 'hush lamp' }])).results[0].item?.id).toBe(secret.id);

    await hide(secret.id, false);
    expect((await detail(player.token, secret.id).expect(200)).body.item.name).toBe('Whispering Lantern');
  });

  test('a hidden base item disappears from the links, pack contents and ambiguity a player sees', async () => {
    const { gm, player, list, detail, members, resolve, hide, id } = await setup();
    await hide(id('Longsword|PHB'));

    const [plusOne] = (await list(player.token, '?q=%2B1 longsword')).items;
    expect(label(plusOne)).toBe('+1 Longsword|DMG');
    expect(plusOne.base).toBeUndefined();
    expect(plusOne.family?.id).toBe(id('+1 Weapon|DMG'));
    expect(((await detail(player.token, id('Stonemaker Blade|HB')).expect(200)).body as { item: Item }).item.base).toBeUndefined();

    const pack = await members(player.token, id("Explorer's Pack|HB"));
    expect(pack).toMatchObject({ relation: 'pack_content', total: 1 });
    expect(pack.members.map(member => [label(member.item), member.quantity])).toEqual([['Sling Bullet|XPHB', 20]]);
    expect(JSON.stringify(pack)).not.toContain(`"id":${id('Longsword|PHB')},`);

    // Only visible items compete, so the player's answer never depends on the hidden one.
    expect((await resolve(player.token, [{ name: 'longsword' }])).results[0].item?.source).toBe('XPHB');
    expect((await resolve(gm.token, [{ name: 'longsword' }])).results[0].item).toBeNull();
    expect(((await detail(gm.token, id('Stonemaker Blade|HB')).expect(200)).body as { item: Item }).item.base?.id)
      .toBe(id('Longsword|PHB'));
  });

  test('hiding a family hides its generated specifics from players everywhere, while the GM sees them hidden by family', async () => {
    const { gm, player, list, detail, members, resolve, hide, id } = await setup();
    const family = id('+1 Weapon|XDMG');
    const specific = id('+1 Longsword|XDMG');
    const group = id('Armor of Resistance|DMG');
    expect((await members(player.token, group)).members.map(member => label(member.item)))
      .toEqual(['Armor of Fire Resistance|DMG', '+1 Longsword|XDMG']);
    await hide(family);

    await detail(player.token, specific).expect(404);
    const visible = await list(player.token, '?specifics=true&limit=100');
    expect(visible.total).toBe(24);
    expect(visible.items.map(label)).not.toContain('+1 Longsword|XDMG');
    expect(visible.items.map(label)).not.toContain('+1 Pitchfork|XDMG');
    expect(visible.items.map(label)).not.toContain('+1 Weapon|XDMG');
    expect(await members(player.token, group)).toMatchObject({ relation: 'group_member', total: 1 });
    expect((await resolve(player.token, [{ name: '+1 Longsword', source: 'XDMG' }])).results[0].item).toBeNull();
    // The specific's own flag stays off: unhiding the family brings it back.
    const seen = ((await detail(gm.token, specific).expect(200)).body as { item: Item }).item;
    expect(seen.gm).toMatchObject({ hidden: false, hiddenByFamily: true });
    expect(await members(gm.token, family)).toMatchObject({ relation: 'specific', total: 2 });

    // A GM can also hide one specific of a visible family.
    await hide(family, false);
    await hide(id('+1 Pitchfork|XDMG'));
    expect((await members(player.token, family)).members.map(member => label(member.item))).toEqual(['+1 Longsword|XDMG']);
  });
});

describe('item detail and members', () => {
  test('a player detail cannot acquire an alias written after the item was hidden', async () => {
    const { http, gm, player, detail, create, hide } = await setup();
    const item = await create(homebrew());
    const response = await afterCatalogQuery('i.page, i.details', async () => {
      await hide(item.id);
      await asToken(http.put(`/api/dnd5e/items/${item.id}`), gm.token)
        .send(homebrew({ aliases: ['Hidden alias'] })).expect(200);
    }, async () => detail(player.token, item.id).expect(200));
    expect((response.body as { item: Item }).item.aliases).toEqual(['Hush Lamp']);
    expect((await detail(player.token, item.id)).status).toBe(404);
  });

  test('a player pack page keeps its visible parent and contents in the same catalog state', async () => {
    const { http, gm, player, detail, id, members, hide } = await setup();
    const pack = id("Explorer's Pack|HB");
    const readMembers = () => members(player.token, pack);
    const before = await readMembers();
    expect(before.total).toBe(2);
    const member = ((await detail(gm.token, id('Longsword|PHB')).expect(200)).body as { item: Item }).item;
    const overlapping = await afterCatalogQuery('i.page, i.details', async () => {
      await hide(pack);
      await asToken(http.put(`/api/dnd5e/items/${member.id}`), gm.token)
        .send({ ...asInput(member), aliases: ['New member alias'] }).expect(200);
    }, readMembers);
    expect(overlapping).toEqual(before);
    expect((await asToken(http.get(`/api/dnd5e/items/${pack}/members`), player.token)).status).toBe(404);
  });

  test('player resolve uses the same visibility for name and alias candidates', async () => {
    const { player, create, hide, resolve } = await setup();
    const item = await create(homebrew());
    const lookup = () => resolve(player.token, [{ name: item.name }, { name: 'Hush Lamp' }]);
    const before = await lookup();
    expect(before.results.map(result => result.item?.id)).toEqual([item.id, item.id]);
    const overlapping = await afterCatalogQuery('i.name IN', async () => {
      await hide(item.id);
    }, lookup);
    expect(overlapping).toEqual(before);
    expect((await lookup()).results.map(result => result.item)).toEqual([null, null]);
  });

  test('a detail carries normalized fields and exact values, never the stored upstream record, and GM state only for GMs', async () => {
    const { gm, player, detail, id } = await setup();
    const blade = await detail(player.token, id('Stonemaker Blade|HB')).expect(200);
    expect(JSON.stringify(blade.body)).not.toMatch(/upstream|baseItemId|importKey|importRevision|locallyEdited/i);
    const item = (blade.body as { item: Item }).item;
    expect(item).toMatchObject({
      kind: 'concrete', origin: 'imported', page: 3, rarity: 'very rare', requiresAttunement: true,
      attunementNote: 'by a dwarf', aliases: ['Stonecutter'], base: { id: id('Longsword|PHB'), name: 'Longsword', source: 'PHB' },
      details: {
        damage: { dice: '1d8', type: 'slashing' }, charges: '1d6 + 1', recharge: 'dawn',
        spells: [{ name: 'meld into stone', source: 'XPHB' }],
      },
    });
    expect(item.gm).toBeUndefined();

    const bullet = ((await detail(player.token, id('Sling Bullet|XPHB')).expect(200)).body as { item: Item }).item;
    expect(bullet).toMatchObject({ valueCp: 0.2, weightLb: 0.075 });

    const gmView = await detail(gm.token, id('Stonemaker Blade|HB')).expect(200);
    expect(JSON.stringify(gmView.body)).not.toContain('upstream');
    expect((gmView.body as { item: Item }).item.gm).toEqual({
      hidden: false, hiddenByFamily: false, locallyEdited: false, importKey: 'named:stonemaker blade|hb', importRevision: REVISION,
    });
  });

  test('a family lists its specifics, a group its members and a pack its contents, one page at a time', async () => {
    const { player, members, id } = await setup();
    const family = await members(player.token, id('+1 Weapon|DMG'));
    expect(family).toMatchObject({ relation: 'specific', total: 2, offset: 0 });
    expect(family.members.map(member => label(member.item))).toEqual(['+1 Longsword|DMG', '+1 Pitchfork|DMG']);
    const second = await members(player.token, id('+1 Weapon|DMG'), '?limit=1&offset=1');
    expect(second).toMatchObject({ total: 2, offset: 1, limit: 1 });
    expect(second.members.map(member => label(member.item))).toEqual(['+1 Pitchfork|DMG']);

    // The group's unresolved third member is left out.
    const group = await members(player.token, id('Armor of Resistance|DMG'));
    expect(group).toMatchObject({ relation: 'group_member', total: 2 });
    const pack = await members(player.token, id("Explorer's Pack|HB"));
    expect(pack.members.map(member => [label(member.item), member.quantity])).toEqual([['Longsword|PHB', undefined], ['Sling Bullet|XPHB', 20]]);
    expect(await members(player.token, id('Longsword|PHB'))).toMatchObject({ relation: null, members: [], total: 0 });
  });

  test('resolve answers each reference in order by name then alias, within its source, and leaves ambiguous ones unresolved', async () => {
    const { http, player, resolve, id } = await setup();
    const { results } = await resolve(player.token, [
      { name: 'longsword', source: 'phb' },
      { name: 'Longsword' },
      { name: 'STONECUTTER' },
      { name: 'Stonecutter', source: 'PHB' },
      { name: '+1 Longsword', source: 'XDMG' },
      { name: 'Nothing at all' },
      { name: 'longsword', source: 'phb' },
    ]);
    expect(results.map(result => result.item?.id ?? null)).toEqual([
      id('Longsword|PHB'), null, id('Stonemaker Blade|HB'), null, id('+1 Longsword|XDMG'), null, id('Longsword|PHB'),
    ]);
    expect(results[1].ref).toEqual({ name: 'Longsword' });

    const tooMany = Array.from({ length: 101 }, () => ({ name: 'Longsword' }));
    await asToken(http.post('/api/dnd5e/items/resolve'), player.token).send({ refs: tooMany }).expect(400);
    await asToken(http.post('/api/dnd5e/items/resolve'), player.token).send({ refs: [{ source: 'PHB' }] }).expect(400);
  });
});

describe('GM item authoring', () => {
  test('creating an invalid item returns the nested damage field path', async () => {
    const http = createHttpAgent();
    const gm = await createGm();
    const response = await asToken(http.post('/api/dnd5e/items'), gm.token)
      .send(homebrew({ details: { damage: { dice: '' } } })).expect(400);
    expect(response.body).toEqual({
      message: 'Invalid item data.',
      details: [{ path: 'details.damage.dice', message: 'Damage dice is required.' }],
    });
  });

  test('updating an invalid item returns the value field path', async () => {
    const http = createHttpAgent();
    const gm = await createGm();
    const post = () => asToken(http.post('/api/dnd5e/items'), gm.token);
    const created = await post().send(homebrew()).expect(201);
    const { item } = created.body as { item: Item };
    const response = await asToken(http.put(`/api/dnd5e/items/${item.id}`), gm.token)
      .send(homebrew({ valueCp: -1 })).expect(400);
    expect(response.body).toEqual({
      message: 'Invalid item data.',
      details: [{ path: 'valueCp', message: expect.stringMatching(/^Value must be a number/) }],
    });
  });

  test('a GM can save a full-length multibyte description and oversized item JSON returns 413', async () => {
    const { http, gm, create, detail } = await setup();
    const item = await create(homebrew());
    const description = '界'.repeat(ITEM_LIMITS.description);
    const put = () => asToken(http.put(`/api/dnd5e/items/${item.id}`), gm.token);
    const saved = await put().send(homebrew({ details: { description } })).expect(200);
    expect((saved.body as { item: Item }).item.details.description).toBe(description);

    const oversized = await put().send(homebrew({ details: { description: '界'.repeat(350_000) } }));
    expect(oversized.status).toBe(413);
    const read = await detail(gm.token, item.id).expect(200);
    expect((read.body as { item: Item }).item.details.description).toBe(description);
  });

  test.each(['create', 'edit', 'unchanged save', 'visibility'] as const)(
    'a successful %s returns its own item even when a delete follows the commit',
    async (operation) => {
      const { http, gm, create, detail } = await setup();
      const item = operation === 'create' ? undefined : await create(homebrew());
      const input = operation === 'edit' ? homebrew({ name: 'Edited Lantern', aliases: ['Updated alias'] }) : homebrew();
      const itemPath = `/api/dnd5e/items/${item?.id}`;
      await withNextCatalogConnection(async connection => {
        const commit = connection.commit.bind(connection);
        let deletedId: number | undefined;
        const barrier = vi.spyOn(connection, 'commit').mockImplementationOnce(async () => {
          await commit();
          const [[row]] = await dnd5ePool.query<RowDataPacket[]>('SELECT id FROM items WHERE name = ?', [input.name]);
          deletedId = row.id as number;
          await asToken(http.delete(`/api/dnd5e/items/${deletedId}`), gm.token).expect(204);
        });
        try {
          const request = operation === 'create' ? http.post('/api/dnd5e/items')
            : http.put(operation === 'visibility' ? `${itemPath}/visibility` : itemPath);
          const response = await asToken(request, gm.token).send(operation === 'visibility' ? { hidden: true } : input);
          expect(response.status).toBe(operation === 'create' ? 201 : 200);
          const returned = (response.body as { item: Item }).item;
          expect(returned).toMatchObject({
            id: deletedId, name: input.name, aliases: input.aliases, gm: { hidden: operation === 'visibility' },
          });
          expect(deletedId).toEqual(expect.any(Number));
          expect((await detail(gm.token, returned.id)).status).toBe(404);
        } finally {
          barrier.mockRestore();
        }
      });
    },
  );

  test('players cannot create, edit, hide or delete items', async () => {
    const { http, player, id } = await setup();
    const target = id('Longsword|PHB');
    await asToken(http.post('/api/dnd5e/items'), player.token).send(homebrew()).expect(403);
    await asToken(http.put(`/api/dnd5e/items/${target}`), player.token).send(homebrew()).expect(403);
    await asToken(http.put(`/api/dnd5e/items/${target}/visibility`), player.token).send({ hidden: true }).expect(403);
    await asToken(http.delete(`/api/dnd5e/items/${target}`), player.token).expect(403);
    const [[row]] = await dnd5ePool.query<RowDataPacket[]>('SELECT name, is_hidden, deleted_at FROM items WHERE id = ?', [target]);
    expect({ ...row }).toEqual({ name: 'Longsword', is_hidden: 0, deleted_at: null });
  });

  test('a GM creates homebrew, and a duplicate of an imported specific is standalone homebrew linked only to its base', async () => {
    const { http, gm, player, detail, create, id } = await setup();
    const made = await create(homebrew({ valueCp: 10_000_000.0005, weightLb: 0.075 }));
    expect(made).toMatchObject({ kind: 'concrete', origin: 'homebrew', valueCp: 10_000_000.0005, weightLb: 0.075, aliases: ['Hush Lamp'] });
    expect(made.gm).toEqual({ hidden: false, hiddenByFamily: false, locallyEdited: false });

    const original = ((await detail(gm.token, id('+1 Longsword|DMG')).expect(200)).body as { item: Item }).item;
    const copy = await create({ ...asInput(original), name: '+1 Longsword (house)' });
    expect(copy).toMatchObject({ origin: 'homebrew', source: 'DMG', base: { id: id('Longsword|PHB') }, details: original.details });
    expect(copy.family).toBeUndefined();
    expect(copy.id).not.toBe(original.id);
    expect(((await detail(player.token, copy.id).expect(200)).body as { item: Item }).item.name).toBe('+1 Longsword (house)');

    await asToken(http.post('/api/dnd5e/items'), gm.token).send({ ...homebrew(), rarity: 'mythic' }).expect(400);
    for (const base of [id('+1 Longsword|DMG'), id('+1 Weapon|DMG'), 2_000_000]) {
      await asToken(http.post('/api/dnd5e/items'), gm.token).send(homebrew({ baseItemId: base })).expect(400);
    }
  });

  test('editing an imported item keeps its id, identity and source record and marks it edited, so only a forced re-import overwrites it', async () => {
    const { http, gm, detail, hide, id } = await setup();
    const bladeId = id('Stonemaker Blade|HB');
    const read = async () => ((await detail(gm.token, bladeId).expect(200)).body as { item: Item }).item;
    const put = (input: ItemInput) => asToken(http.put(`/api/dnd5e/items/${bladeId}`), gm.token).send(input);

    // Saving the form unchanged is not an edit.
    await put(asInput(await read())).expect(200);
    expect((await read()).gm?.locallyEdited).toBe(false);

    const before = await read();
    const edited = (await put({ ...asInput(before), name: 'Stonecutter of Clan Hammer', aliases: ['Hammerblade'] }).expect(200)).body as { item: Item };
    expect(edited.item).toMatchObject({ id: bladeId, name: 'Stonecutter of Clan Hammer', aliases: ['Hammerblade'], base: before.base });
    expect(edited.item.gm).toMatchObject({ locallyEdited: true, importKey: 'named:stonemaker blade|hb' });
    const [[stored]] = await dnd5ePool.query<RowDataPacket[]>(
      "SELECT details->'$.upstream' IS NOT NULL AS has_upstream FROM items WHERE id = ?", [bladeId],
    );
    expect(stored.has_upstream).toBe(1);
    await hide(bladeId);

    await reimport();
    expect((await read()).name).toBe('Stonecutter of Clan Hammer');
    await reimport({ force: true });
    expect(await read()).toMatchObject({ id: bladeId, name: 'Stonemaker Blade', gm: { hidden: true, locallyEdited: false } });
  });

  test("a generated specific's base printing is its identity, and only concrete items can name a base", async () => {
    const { http, gm, detail, id } = await setup();
    const specific = ((await detail(gm.token, id('+1 Longsword|DMG')).expect(200)).body as { item: Item }).item;
    const put = (itemId: number, input: ItemInput) => asToken(http.put(`/api/dnd5e/items/${itemId}`), gm.token).send(input);

    const conflict = await put(specific.id, { ...asInput(specific), baseItemId: id('Pitchfork|HB') }).expect(409);
    expect(conflict.body.message).toMatch(/base printing/);
    // Renaming it leaves both parent links in place.
    const withoutBase = asInput(specific);
    delete withoutBase.baseItemId;
    const renamed = ((await put(specific.id, { ...withoutBase, name: 'Dwarven +1 Longsword' }).expect(200)).body as { item: Item }).item;
    expect(renamed).toMatchObject({ family: specific.family, base: specific.base, gm: { importKey: specific.gm?.importKey } });

    const family = ((await detail(gm.token, id('+1 Weapon|DMG')).expect(200)).body as { item: Item }).item;
    await put(family.id, { ...asInput(family), baseItemId: id('Longsword|PHB') }).expect(400);
    await put(2_000_000, homebrew()).expect(404);
  });

  test('deletion is soft: the item is gone for everyone, a deleted family takes its specifics, and a re-import brings back neither', async () => {
    const { http, gm, player, list, detail, members, id } = await setup();
    const family = id('+1 Weapon|DMG');
    const specific = id('+1 Longsword|DMG');
    await asToken(http.delete(`/api/dnd5e/items/${family}`), gm.token).expect(204);

    for (const token of [gm.token, player.token]) {
      await detail(token, family).expect(404);
      await detail(token, specific).expect(404);
      expect((await list(token, '?specifics=true&limit=100')).items.map(item => item.id)).not.toContain(family);
      expect((await list(token, '?q=%2B1 longsword')).items.map(label)).toEqual(['+1 Longsword|XDMG', 'Keen +1 Longsword|HB']);
    }
    await asToken(http.delete(`/api/dnd5e/items/${family}`), gm.token).expect(404);
    await asToken(http.put(`/api/dnd5e/items/${specific}/visibility`), gm.token).send({ hidden: true }).expect(404);

    await reimport({ force: true });
    await detail(gm.token, family).expect(404);
    await detail(gm.token, specific).expect(404);
    expect((await members(gm.token, id('+1 Weapon|XDMG'))).total).toBe(2);
    const [[row]] = await dnd5ePool.query<RowDataPacket[]>('SELECT COUNT(*) AS kept FROM items WHERE id IN (?, ?)', [family, specific]);
    expect(row.kept).toBe(2);
  });
});
