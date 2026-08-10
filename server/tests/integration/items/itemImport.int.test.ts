import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { RowDataPacket } from 'mysql2/promise';
import { describe, expect, test, vi } from 'vitest';
import { dnd5ePool } from '../../../src/db.js';
import {
  importDnd5eToolsItems,
  type Dnd5eToolsItemImportOptions,
} from '../../../src/services/dnd5etools/dnd5eToolsItemImportService.js';
import { buildItemImportPlan } from '../../../src/utils/dnd5etools/item-transformer.js';
import { fixtureRecords, itemSources } from '../../fixtures/dnd5eToolsItems.js';

const REVISION = 'c3a5185c8f3fc8937725fdc4be249eb7120057c7';
const plan = (sources = itemSources()) => buildItemImportPlan(sources);
const runImport = (options: Partial<Dnd5eToolsItemImportOptions> = {}, sources = itemSources()) =>
  importDnd5eToolsItems(plan(sources), { revision: REVISION, ...options });

interface ItemRow {
  id: number;
  import_key: string;
  kind: string;
  name: string;
  family_id: number | null;
  base_item_id: number | null;
  value_cp: string | null;
  weight_lb: string | null;
  locally_edited: number;
  is_hidden: number;
  deleted_at: Date | null;
  import_revision: string;
}

async function rows(): Promise<Map<string, ItemRow>> {
  const [result] = await dnd5ePool.query<(RowDataPacket & ItemRow)[]>(
    'SELECT id, import_key, kind, name, family_id, base_item_id, value_cp, weight_lb, locally_edited, is_hidden, deleted_at, import_revision FROM items',
  );
  return new Map(result.map(row => [row.import_key, { ...row }]));
}

async function row(importKey: string): Promise<ItemRow> {
  const found = (await rows()).get(importKey);
  if (!found) throw new Error(`${importKey} is not in dnd5e.items`);
  return found;
}

// What the GM does in the app (step 03 adds the API): edit, hide and soft-delete catalog rows.
const gmEdit = (importKey: string, name: string) =>
  dnd5ePool.execute('UPDATE items SET name = ?, locally_edited = 1 WHERE import_key = ?', [name, importKey]);
const gmHide = (importKey: string) => dnd5ePool.execute('UPDATE items SET is_hidden = 1 WHERE import_key = ?', [importKey]);
const gmDelete = (importKey: string) => dnd5ePool.execute('UPDATE items SET deleted_at = CURRENT_TIMESTAMP WHERE import_key = ?', [importKey]);

const statusOf = (result: Awaited<ReturnType<typeof runImport>>, importKey: string) =>
  result.results.find(item => item.importKey === importKey);

describe('5etools item import', () => {
  test('an import writes every planned row with exact values, parent links, aliases and ordered relations', async () => {
    const result = await runImport();
    expect(result).toMatchObject({ total: 27, inserted: 27, updated: 0, skipped: 0, failed: 0 });

    const stored = await rows();
    const specific = stored.get('specific:+1 weapon|dmg>longsword|phb');
    expect(specific).toMatchObject({
      kind: 'concrete',
      name: '+1 Longsword',
      family_id: stored.get('family:+1 weapon|dmg')?.id,
      base_item_id: stored.get('base:longsword|phb')?.id,
      import_revision: REVISION,
      locally_edited: 0,
      is_hidden: 0,
      deleted_at: null,
    });
    expect(stored.get('base:sling bullet|xphb')).toMatchObject({ value_cp: '0.2000', weight_lb: '0.0750' });
    expect(stored.get('named:stonemaker blade|hb')?.base_item_id).toBe(stored.get('base:longsword|phb')?.id);

    const [aliases] = await dnd5ePool.query<RowDataPacket[]>('SELECT alias, alias_key FROM item_aliases');
    expect(aliases.map(alias => ({ ...alias }))).toEqual([{ alias: 'Stonecutter', alias_key: 'stonecutter' }]);

    const [members] = await dnd5ePool.query<RowDataPacket[]>(
      `SELECT r.relation, r.position, r.member_ref, m.import_key AS member, r.quantity
       FROM item_relations r JOIN items i ON i.id = r.item_id LEFT JOIN items m ON m.id = r.member_item_id
       ORDER BY i.import_key, r.position`,
    );
    expect(members.map(member => ({ ...member }))).toEqual([
      // base:sling bullets (20)|xphb
      { relation: 'pack_content', position: 0, member_ref: 'sling bullet|xphb', member: 'base:sling bullet|xphb', quantity: 20 },
      // group:armor of resistance|dmg: an unknown member keeps its reference without a link
      { relation: 'group_member', position: 0, member_ref: 'Armor of Fire Resistance', member: 'family:armor of fire resistance|dmg', quantity: null },
      { relation: 'group_member', position: 1, member_ref: '+1 Longsword|XDMG', member: 'specific:+1 weapon|xdmg>longsword|xphb', quantity: null },
      { relation: 'group_member', position: 2, member_ref: 'Armor of Frost Resistance|DMG', member: null, quantity: null },
      // named:explorer's pack|hb
      { relation: 'pack_content', position: 0, member_ref: 'longsword|phb', member: 'base:longsword|phb', quantity: null },
      { relation: 'pack_content', position: 1, member_ref: 'sling bullet|xphb', member: 'base:sling bullet|xphb', quantity: 20 },
    ]);
  });

  test('a repeated import updates rows in place, keeping every id and identity', async () => {
    await runImport();
    const before = await rows();

    const result = await runImport();
    expect(result).toMatchObject({ inserted: 0, updated: 27, skipped: 0, failed: 0 });
    const after = await rows();
    expect([...after.entries()].map(([key, item]) => [key, item.id]).sort())
      .toEqual([...before.entries()].map(([key, item]) => [key, item.id]).sort());
    const [[{ relations }]] = await dnd5ePool.query<RowDataPacket[]>('SELECT COUNT(*) AS relations FROM item_relations');
    expect(relations).toBe(6);
  });

  test('an ordinary re-import skips items edited in the app; --force overwrites them, and a hidden item stays hidden either way', async () => {
    await runImport();
    const { id } = await row('named:stonemaker blade|hb');
    await gmEdit('named:stonemaker blade|hb', 'Stonecutter of Clan Hammer');
    await gmHide('named:stonemaker blade|hb');
    await gmHide('base:pitchfork|hb');

    const ordinary = await runImport();
    expect(statusOf(ordinary, 'named:stonemaker blade|hb')).toMatchObject({ status: 'skipped', reason: 'edited in the app (use --force to overwrite)', itemId: id });
    expect(statusOf(ordinary, 'base:pitchfork|hb')?.status).toBe('updated');
    expect(await row('named:stonemaker blade|hb')).toMatchObject({ id, name: 'Stonecutter of Clan Hammer', locally_edited: 1, is_hidden: 1 });
    expect((await row('base:pitchfork|hb')).is_hidden).toBe(1);

    const forced = await runImport({ force: true });
    expect(statusOf(forced, 'named:stonemaker blade|hb')?.status).toBe('updated');
    expect(await row('named:stonemaker blade|hb')).toMatchObject({ id, name: 'Stonemaker Blade', locally_edited: 0, is_hidden: 1 });
    expect((await row('base:pitchfork|hb')).is_hidden).toBe(1);
  });

  test('a deleted item is never re-imported, and deleting a family suppresses its generated specifics', async () => {
    // First import without the edition-less +1 family's pitchfork specific existing yet.
    const sources = itemSources();
    await runImport({}, itemSources({ variants: [fixtureRecords.plusOneWeaponDmg] }));
    await gmDelete('family:+1 weapon|dmg');
    await gmDelete('named:slumbering dragon vessel|ftd');
    const deletedSpecific = await row('specific:+1 weapon|dmg>longsword|phb');

    for (const force of [false, true]) {
      const result = await runImport({ force }, sources);
      expect(statusOf(result, 'family:+1 weapon|dmg')).toMatchObject({ status: 'skipped', reason: 'deleted in the app' });
      expect(statusOf(result, 'named:slumbering dragon vessel|ftd')).toMatchObject({ status: 'skipped', reason: 'deleted in the app' });
      expect(statusOf(result, 'specific:+1 weapon|dmg>longsword|phb')).toMatchObject({ status: 'skipped', reason: 'its family was deleted in the app' });
      // Other families still import, and copies of a deleted record still resolve from the input.
      expect(statusOf(result, 'specific:+1 weapon|xdmg>pitchfork|hb')?.status).toMatch(/inserted|updated/);
      expect(statusOf(result, 'named:stirring dragon vessel|ftd')?.status).toMatch(/inserted|updated/);
    }
    const stored = await rows();
    expect(stored.get('family:+1 weapon|dmg')?.deleted_at).not.toBeNull();
    expect(stored.get('named:slumbering dragon vessel|ftd')?.deleted_at).not.toBeNull();
    expect(stored.get('specific:+1 weapon|dmg>longsword|phb')).toEqual(deletedSpecific);
  });

  test('skip mode leaves imported rows alone; insert mode fails on them and stops unless told to continue', async () => {
    await runImport({}, itemSources({ items: [fixtureRecords.slumbering] }));
    const slumbering = await row('named:slumbering dragon vessel|ftd');
    await dnd5ePool.execute('UPDATE items SET rarity = ? WHERE id = ?', ['common', slumbering.id]);

    const skipped = await runImport({ mode: 'skip' });
    expect(statusOf(skipped, 'named:slumbering dragon vessel|ftd')).toMatchObject({ status: 'skipped', reason: 'already imported' });
    expect(statusOf(skipped, 'named:stirring dragon vessel|ftd')?.status).toBe('inserted');
    const [[{ rarity }]] = await dnd5ePool.query<RowDataPacket[]>('SELECT rarity FROM items WHERE id = ?', [slumbering.id]);
    expect(rarity).toBe('common');

    const stopped = await runImport({ mode: 'insert' });
    expect(stopped).toMatchObject({ failed: 1, inserted: 0, stoppedAt: 'Longsword|PHB' });
    expect(stopped.results).toHaveLength(1);

    const continued = await runImport({ mode: 'insert', continueOnError: true });
    expect(continued).toMatchObject({ failed: 27, inserted: 0 });
    expect(continued.stoppedAt).toBeUndefined();
  });

  test('partial imports retain links to omitted targets and compute family category from retained specifics', async () => {
    const group = { name: 'Test Group', source: 'HB', items: ['Longsword|PHB', '+1 Longsword|DMG'] };
    const pack = { name: 'Test Pack', source: 'HB', packContents: ['Test Group|HB'] };
    const ranged = { name: 'Test Bow', source: 'PHB', edition: 'classic', type: 'R', weapon: true };
    const blade = { ...fixtureRecords.fixtureBlade, reqAttune: 'optional' };
    const variants = [fixtureRecords.plusOneWeaponDmg];
    await runImport({}, itemSources({
      items: [blade, pack], groups: [group], bases: [fixtureRecords.longswordPhb, ranged], variants,
    }));

    const bladeKey = 'named:stonemaker blade|hb';
    const originalBase = (await row(bladeKey)).base_item_id;
    expect(originalBase).toBeGreaterThan(0);
    const [[attunement]] = await dnd5ePool.execute<RowDataPacket[]>(
      'SELECT requires_attunement, attunement_note FROM items WHERE import_key = ?', [bladeKey],
    );
    expect({ ...attunement }).toEqual({ requires_attunement: 0, attunement_note: 'Optional' });

    // A GM rename leaves the original imported reference resolvable.
    await gmEdit('specific:+1 weapon|dmg>longsword|phb', 'Renamed Specific');
    const partialResult = await runImport({}, itemSources({ items: [blade, pack], groups: [group], bases: [], variants: [] }));
    expect(partialResult.failed).toBe(0);
    expect((await row(bladeKey)).base_item_id).toBe(originalBase);
    const [linked] = await dnd5ePool.query<RowDataPacket[]>(`
      SELECT target.import_key FROM item_relations r JOIN items target ON target.id = r.member_item_id
      ORDER BY r.relation, r.position
    `);
    expect(linked.map(target => target.import_key)).toEqual([
      'base:longsword|phb', 'specific:+1 weapon|dmg>longsword|phb', 'group:test group|hb',
    ]);

    await runImport({}, itemSources({ items: [], groups: [], bases: [fixtureRecords.longswordPhb], variants }));
    const [[family]] = await dnd5ePool.execute<RowDataPacket[]>(
      'SELECT category FROM items WHERE import_key = ?', ['family:+1 weapon|dmg'],
    );
    expect(family.category).toBeNull();
  });

  test('a family deleted between its write and a specific write suppresses the specific', async () => {
    const family = 'family:+1 weapon|dmg';
    const specific = 'specific:+1 weapon|dmg>longsword|phb';
    const sources = itemSources({ items: [], groups: [], bases: [fixtureRecords.longswordPhb], variants: [fixtureRecords.plusOneWeaponDmg] });
    await runImport({}, sources);
    const blocker = await dnd5ePool.getConnection();
    const revision = 'second-import';
    let pending: ReturnType<typeof runImport> | undefined;
    try {
      await blocker.beginTransaction();
      await blocker.execute('SELECT id FROM items WHERE import_key = ? FOR UPDATE', [specific]);
      pending = runImport({ revision }, sources);
      await vi.waitFor(async () => {
        expect((await row(family)).import_revision).toBe(revision);
      }, { timeout: 5000 });
      await gmDelete(family);
    } finally {
      await blocker.rollback();
      blocker.release();
      await pending;
    }
    expect(statusOf(await pending, specific)?.status).toBe('skipped');
    expect((await row(specific)).import_revision).toBe(REVISION);
  }, 12_000);

  test('records missing from a partial input are left untouched', async () => {
    await runImport();
    const before = await rows();

    const partial = itemSources({ items: [fixtureRecords.slumbering], groups: [], variants: [] });
    const result = await runImport({}, partial);
    expect(result).toMatchObject({ total: 8, updated: 8, failed: 0 });
    expect([...(await rows()).keys()].sort()).toEqual([...before.keys()].sort());
    expect((await rows()).get('specific:barding|phb>plate armor|phb')?.deleted_at).toBeNull();
  });
});

describe('item import CLI', () => {
  const serverDir = fileURLToPath(new URL('../../../', import.meta.url));
  const tsx = path.join(serverDir, 'node_modules', '.bin', 'tsx');

  const cli = async (args: string[], sources = itemSources()) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'item-import-'));
    try {
      const files = { items: path.join(dir, 'items.json'), base: path.join(dir, 'items-base.json'), variants: path.join(dir, 'magicvariants.json') };
      await Promise.all([
        writeFile(files.items, JSON.stringify(sources.items)),
        writeFile(files.base, JSON.stringify(sources.base)),
        writeFile(files.variants, JSON.stringify(sources.variants)),
      ]);
      // process.env carries the isolated test database settings (port 3307), which dotenv does not override.
      const { stdout } = await promisify(execFile)(
        tsx,
        ['src/scripts/import-dnd5etools-items.ts', '--file', files.items, '--base', files.base, '--variants', files.variants, ...args],
        { cwd: serverDir, env: process.env },
      );
      return stdout;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  test('a dry run reports the plan and writes nothing; the same command without it imports', async () => {
    const dryRun = await cli(['--dry-run', '--revision', REVISION]);
    expect(dryRun).toContain(`Source revision: commit ${REVISION}`);
    expect(dryRun).toContain('8 generated specifics');
    expect(dryRun).toContain('unresolved: 1');
    expect((await rows()).size).toBe(0);

    const real = await cli(['--revision', REVISION]);
    expect(real).toContain('Planned: 27; attempted: 27.');
    expect(real).toContain('Inserted: 27; updated: 0; skipped: 0; failed: 0.');
    expect(real).toContain('App role:');
    expect(real).toContain('concrete: inserted 20');
    expect((await rows()).size).toBe(27);
  }, 30_000);
  test('invalid rows stop the CLI by default and valid rows import with continue-on-error', async () => {
    const sources = {
      ...itemSources({ bases: [], groups: [], variants: [] }),
      items: { item: [null, fixtureRecords.slumbering] },
    };
    await expect(cli(['--dry-run'], sources)).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('invalid: 1') });
    await expect(cli([], sources)).rejects.toMatchObject({ code: 1 });
    expect((await rows()).size).toBe(0);
    await expect(cli(['--continue-on-error'], sources))
      .rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('Inserted: 1;') });
    expect((await rows()).size).toBe(1);
    await expect(cli(['--continue-on-error', '--mode', 'insert'], sources))
      .rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('Planned: 1; attempted: 1.') });
  }, 30_000);

});
