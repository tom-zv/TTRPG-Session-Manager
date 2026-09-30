import { randomUUID } from 'node:crypto';
import { login, registerUser } from '../../src/api/auth/authService.js';
import campaignService from '../../src/api/campaigns/campaignService.js';

export const factoryPassword = 'test-password-only';

async function createUser(isGM: boolean) {
  const username = `test-${randomUUID().slice(0, 24)}`;
  const user = await registerUser({
    username,
    password: factoryPassword,
    email: `${username}@example.test`,
    isGM,
  });
  const { sessionDb } = await login(username, factoryPassword);
  return { user, token: sessionDb.token };
}

export const createGm = () => createUser(true);
export const createPlayer = () => createUser(false);

/** A campaign created through the real service, with these players admitted. */
export async function createCampaign(gm: { id: number }, options: { name?: string; members?: { id: number }[] } = {}) {
  const campaign = await campaignService.createCampaign(options.name ?? `campaign-${randomUUID().slice(0, 8)}`, null, gm.id);
  for (const member of options.members ?? []) await campaignService.addMember(campaign.id, member.id);
  return campaign;
}
