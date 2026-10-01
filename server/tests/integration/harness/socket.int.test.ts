import { expect, test } from 'vitest';
import type { EncounterJoinAck } from 'shared/sockets/encounters/types.js';
import encounterService from '../../../src/api/encounter/encounters/encounterService.js';
import { createCampaign, createGm, createPlayer } from '../../support/factories.js';
import { emitWithAck, startSocketServer } from '../../support/socket.js';

test('a valid session joins an encounter with its state; an invalid token is refused', async () => {
  const { user: player } = await createPlayer();
  const { user: gm, token } = await createGm();
  const campaign = await createCampaign(gm, { members: [player] });
  const encounterId = await encounterService.insertEncounter('dnd5e', {
    system_id: await encounterService.getSystemId('dnd5e'),
    campaign_id: campaign.id,
    name: 'Socket proving encounter',
    gm_notes: [],
  }, gm);
  const server = await startSocketServer();
  const socket = await server.connect('/encounter', token);
  expect(socket.connected).toBe(true);
  const ack = await emitWithAck(socket, 'encounter:join', { encounterId }) as EncounterJoinAck;
  expect(ack).toMatchObject({
    success: true,
    encounterState: { id: encounterId, system: 'dnd5e', version: 0, phase: 'setup', entityStates: [] },
  });
  await expect(server.connect('/encounter', 'invalid-session-token')).rejects.toThrow(/invalid token/i);
});
