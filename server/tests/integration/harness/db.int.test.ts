import { expect, test } from 'vitest';
import { getEncounterDetailsById, getSystemId, insertEncounter } from '../../../src/api/encounter/encounters/encounterModel.js';

test('a model write can be read back with its metadata and JSON notes intact', async () => {
  const data = {
    system_id: await getSystemId('dnd5e'),
    name: "The dragon's lair",
    description: 'An integration encounter',
    location: 'Mountain',
    difficulty: 'hard',
    gm_notes: [{ text: 'Keep the bridge intact', timestamp: '2026-11-16T00:00:00Z' }],
  };
  const id = await insertEncounter(data);
  expect(id).toBeGreaterThan(0);
  const encounter = await getEncounterDetailsById(id);
  expect(encounter).toMatchObject({
    id,
    system: 'dnd5e',
    status: 'planned',
    name: data.name,
    description: data.description,
    location: data.location,
    difficulty: data.difficulty,
    gm_notes: data.gm_notes,
  });
});
