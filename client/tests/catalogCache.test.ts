/* eslint-disable @tanstack/query/exhaustive-deps -- Deferred responses deliberately change for a fixed key to simulate races. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient, QueryObserver, focusManager } from '@tanstack/react-query';
import type { DnD5eEntityDetails } from '../../shared/domain/encounters/dnd5e/entity.js';
import type { DnD5eEncounterState } from '../../shared/domain/encounters/dnd5e/encounter.js';
import type { Spell } from '../../shared/domain/dnd5e/spell.js';
import { ENTITY_KEYS } from '../src/pages/EncounterManager/api/dnd5e/entities/query/keys.js';
import { ENCOUNTER_KEYS } from '../src/pages/EncounterManager/api/dnd5e/encounters/query/keys.js';
import { SPELL_KEYS } from '../src/pages/Compendium/api/query/keys.js';
import { spellDetailQuery } from '../src/pages/Compendium/api/query/useSpellQueries.js';
import { storeSpell } from '../src/pages/Compendium/api/query/spellCache.js';
import { updateTemplateCache, removeTemplateCache, updateEntitySettingsCache, refreshDnD5eEncounterTemplates } from '../src/pages/EncounterManager/services/dnd5e/entityTemplateCache.js';
import { entityTemplateQuery, loadEntityTemplates } from '../src/pages/EncounterManager/services/dnd5e/entityTemplateLoader.js';
import DnD5eEntityApi from '../src/pages/EncounterManager/api/dnd5e/entities/dnd5eEntityApi.js';

const entity = (id: number, name = `Entity ${id}`) => ({ templateId: id, name, role: 'pc', hp: 20, settings: { party: { member: true } } }) as DnD5eEntityDetails;
const spell = { id: 1, name: 'Spell', level: 1, components: {}, classes: [], damageTypes: [], saves: [], aliases: [] } as unknown as Spell;
function client() { return new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('mutations never seed absent catalogs; complete catalogs retain party and ordering', () => {
  const qc = client();
  updateTemplateCache(qc, entity(1));
  storeSpell(qc, spell);
  assert.equal(qc.getQueryData(ENTITY_KEYS.summaries()), undefined);
  assert.equal(qc.getQueryData(SPELL_KEYS.index()), undefined);
  removeTemplateCache(qc, 1);
  assert.equal(qc.getQueryData(ENTITY_KEYS.summaries()), undefined);
  qc.setQueryData(ENTITY_KEYS.summaries(), [{ templateId: 2, name: 'Z' }]);
  updateTemplateCache(qc, entity(1, 'A'));
  assert.deepEqual(qc.getQueryData(ENTITY_KEYS.summaries()), [
    { templateId: 1, name: 'A', hp: 20, role: 'pc', cr: undefined, inParty: true }, { templateId: 2, name: 'Z' },
  ]);
  qc.clear();
});

test('older catalog and spell detail responses cannot undo authoritative writes', async () => {
  const qc = client();
  const old = deferred<unknown[]>();
  const read = qc.fetchQuery({ queryKey: ENTITY_KEYS.summaries(), queryFn: () => old.promise }).catch(() => {});
  updateTemplateCache(qc, entity(1));
  old.resolve([{ templateId: 99 }]);
  await read;
  assert.equal(qc.getQueryData(ENTITY_KEYS.summaries()), undefined);
  const index = deferred<unknown[]>();
  const detail = deferred<Spell>();
  const reads = [qc.fetchQuery({ queryKey: SPELL_KEYS.index(), queryFn: () => index.promise }).catch(() => {}),
    qc.fetchQuery({ queryKey: SPELL_KEYS.detail(1), queryFn: () => detail.promise }).catch(() => {})];
  storeSpell(qc, spell);
  index.resolve([{ id: 99 }]); detail.resolve({ ...spell, name: 'Old' });
  await Promise.all(reads);
  assert.equal(qc.getQueryData(SPELL_KEYS.index()), undefined);
  assert.equal(qc.getQueryData<Spell>(SPELL_KEYS.detail(1))?.name, 'Spell');
  qc.clear();
});

test('a canceled initial catalog load restarts for active consumers', async () => {
  const qc = client();
  const old = deferred<DnD5eEntityDetails[]>();
  let calls = 0;
  const observer = new QueryObserver(qc, { queryKey: ENTITY_KEYS.summaries(), queryFn: () => ++calls === 1 ? old.promise : Promise.resolve([entity(1), entity(2)]) });
  const unsubscribe = observer.subscribe(() => {});
  updateTemplateCache(qc, entity(1));
  old.resolve([]);
  await tick();
  assert.equal(calls, 2);
  assert.equal(observer.getCurrentResult().data?.length, 2);
  unsubscribe(); qc.clear();
});

test('settings update retained encounter maps even after individual template eviction', () => {
  const qc = client();
  const key = [...ENCOUNTER_KEYS.entityTemplates(1), [1]];
  qc.setQueryData(key, { 1: entity(1) });
  updateEntitySettingsCache(qc, 1, { party: { member: false } });
  assert.equal(qc.getQueryData<Record<number, DnD5eEntityDetails>>(key)?.[1].settings?.party?.member, false);
  qc.clear();
});

test('overlapping loads batch and deduplicate; canceled entity does not poison its batch neighbor', async () => {
  const qc = client();
  const old = deferred<DnD5eEntityDetails[]>();
  const original = DnD5eEntityApi.getEntityTemplatesByIds;
  const calls: number[][] = [];
  DnD5eEntityApi.getEntityTemplatesByIds = async ids => { calls.push(ids); return old.promise; };
  try {
    const a = loadEntityTemplates(qc, [1, 2, 1]);
    const b = loadEntityTemplates(qc, [2]);
    await tick();
    updateTemplateCache(qc, entity(1, 'New'));
    old.resolve([entity(1, 'Old'), entity(2)]);
    const [first, second] = await Promise.all([a, b]);
    assert.deepEqual(calls, [[1, 2]]);
    assert.equal(first[1].name, 'New');
    assert.equal(second[2].name, 'Entity 2');
    assert.equal(qc.getQueryData<DnD5eEntityDetails>(ENTITY_KEYS.template(1))?.name, 'New');
  } finally { DnD5eEntityApi.getEntityTemplatesByIds = original; qc.clear(); }
});

test('chunks stay bounded and missing templates fail; invalidated templates refresh', async () => {
  const qc = client();
  const original = DnD5eEntityApi.getEntityTemplatesByIds;
  const counts: number[] = [];
  DnD5eEntityApi.getEntityTemplatesByIds = async ids => { counts.push(ids.length); return ids.filter(id => id !== 999).map(id => entity(id)); };
  try {
    await loadEntityTemplates(qc, Array.from({ length: 205 }, (_, i) => i + 1));
    assert.deepEqual(counts, [100, 100, 5]);
    await loadEntityTemplates(qc, [1]); assert.equal(counts.length, 3);
    await qc.invalidateQueries({ queryKey: ENTITY_KEYS.template(1), refetchType: 'none' });
    await loadEntityTemplates(qc, [1]); assert.equal(counts.length, 4);
    await assert.rejects(loadEntityTemplates(qc, [999]), /not found/);
    assert.equal(entityTemplateQuery(qc, 1).staleTime, Infinity);
  } finally { DnD5eEntityApi.getEntityTemplatesByIds = original; qc.clear(); }
});

test('notification during join refresh schedules another read and keeps the latest template', async () => {
  const qc = client();
  const original = DnD5eEntityApi.getEntityTemplatesByIds;
  const old = deferred<DnD5eEntityDetails[]>();
  let calls = 0;
  DnD5eEntityApi.getEntityTemplatesByIds = async () => ++calls === 1 ? old.promise : [entity(1, 'Latest')];
  try {
    const state = { entityStates: [{ templateId: 1 }] } as DnD5eEncounterState;
    const join = refreshDnD5eEncounterTemplates(qc, state);
    await tick();
    const notification = refreshDnD5eEncounterTemplates(qc, state, 1);
    old.resolve([entity(1, 'Old')]);
    await Promise.all([join, notification]);
    assert.equal(calls, 2);
    assert.equal(qc.getQueryData<DnD5eEntityDetails>(ENTITY_KEYS.template(1))?.name, 'Latest');
  } finally { DnD5eEntityApi.getEntityTemplatesByIds = original; qc.clear(); }
});

test('canceling a pending map for an edit restarts it without hanging', async () => {
  const qc = client();
  const original = DnD5eEntityApi.getEntityTemplatesByIds;
  const old = deferred<DnD5eEntityDetails[]>();
  DnD5eEntityApi.getEntityTemplatesByIds = async () => old.promise;
  const key = [...ENCOUNTER_KEYS.entityTemplates(1), [1]];
  const observer = new QueryObserver(qc, { queryKey: key, queryFn: ({ signal }) => loadEntityTemplates(qc, [1], signal) });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await tick();
    updateTemplateCache(qc, entity(1, 'Edited'));
    old.resolve([entity(1, 'Old')]);
    await tick();
    assert.equal(observer.getCurrentResult().data?.[1].name, 'Edited');
    assert.equal(observer.getCurrentResult().isFetching, false);
  } finally { unsubscribe(); DnD5eEntityApi.getEntityTemplatesByIds = original; qc.clear(); }
});


test('time and focus do not refresh cached details; eviction makes the next reader fetch', async () => {
  const qc = client();
  qc.mount();
  const originalNow = Date.now;
  const key = SPELL_KEYS.detail(1);
  let calls = 0;
  const options = { ...spellDetailQuery(1), queryFn: async () => { calls++; return spell; } };
  try {
    await qc.fetchQuery(options);
    Date.now = () => originalNow() + 60 * 60 * 1000;
    const observer = new QueryObserver(qc, options);
    const unsubscribe = observer.subscribe(() => {});
    focusManager.setFocused(false); focusManager.setFocused(true);
    await tick();
    assert.equal(calls, 1);
    unsubscribe();
    qc.removeQueries({ queryKey: key });
    await qc.fetchQuery(options);
    assert.equal(calls, 2);
  } finally { Date.now = originalNow; focusManager.setFocused(undefined); qc.unmount(); qc.clear(); }
});


test('a map waiting for another member uses a template refreshed in the meantime', async () => {
  const qc = client();
  const original = DnD5eEntityApi.getEntityTemplatesByIds;
  const slow = deferred<DnD5eEntityDetails[]>();
  qc.setQueryData(ENTITY_KEYS.template(1), entity(1, 'Old'));
  DnD5eEntityApi.getEntityTemplatesByIds = async ids => ids.includes(2) ? slow.promise : [entity(1, 'Latest')];
  const key = [...ENCOUNTER_KEYS.entityTemplates(1), [1, 2]];
  const observer = new QueryObserver(qc, { queryKey: key, queryFn: ({ signal }) => loadEntityTemplates(qc, [1, 2], signal) });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await tick();
    const refresh = refreshDnD5eEncounterTemplates(qc, { entityStates: [] } as unknown as DnD5eEncounterState, 1);
    await tick();
    slow.resolve([entity(2)]);
    await refresh;
    await tick();
    assert.equal(observer.getCurrentResult().data?.[1].name, 'Latest');
  } finally { unsubscribe(); DnD5eEntityApi.getEntityTemplatesByIds = original; qc.clear(); }
});
