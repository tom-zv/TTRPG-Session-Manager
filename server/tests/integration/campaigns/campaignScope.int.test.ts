import { expect, test } from "vitest";
import { asToken, createHttpAgent } from "../../support/http.js";
import { createGm, createPlayer } from "../../support/factories.js";

type Agent = ReturnType<typeof createHttpAgent>;

async function createCampaign(agent: Agent, token: string, name: string): Promise<number> {
  const response = await asToken(agent.post("/api/campaigns"), token).send({ name: `  ${name}  ` }).expect(201);
  expect(response.body.campaign).toMatchObject({ name, description: "", memberCount: 0 });
  return response.body.campaign.id as number;
}

async function createEncounter(agent: Agent, token: string, campaignId: number, name: string): Promise<number> {
  const response = await asToken(agent.post("/api/dnd5e/encounters"), token)
    .send({ campaignId, data: { name, description: "", location: "", difficulty: "", status: "planned" } })
    .expect(201);
  return response.body.insertId as number;
}

const summaryNames = async (agent: Agent, token: string, campaignId: number) =>
  (await asToken(agent.get(`/api/dnd5e/encounters/summaries?campaignId=${campaignId}`), token).expect(200))
    .body.encounters.map((encounter: { name: string; campaignId: number }) => `${encounter.campaignId}:${encounter.name}`);

test("a GM builds two rosters and each campaign lists only its own encounters", async () => {
  const agent = createHttpAgent();
  const gm = await createGm();
  const [both, onlyA, onlyB] = await Promise.all([createPlayer(), createPlayer(), createPlayer()]);
  const a = await createCampaign(agent, gm.token, "Ashes");
  const b = await createCampaign(agent, gm.token, "Brine");

  for (const [campaignId, player] of [[a, both], [a, onlyA], [b, both], [b, onlyB]] as const) {
    await asToken(agent.put(`/api/campaigns/${campaignId}/members/${player.user.id}`), gm.token).expect(200);
  }
  // Admitting a member twice changes nothing; a GM is never a member row.
  const again = await asToken(agent.put(`/api/campaigns/${a}/members/${both.user.id}`), gm.token).expect(200);
  expect(again.body.members.map((member: { userId: number }) => member.userId).sort())
    .toEqual([both.user.id, onlyA.user.id].sort());
  await asToken(agent.put(`/api/campaigns/${a}/members/${gm.user.id}`), gm.token).expect(400);
  await asToken(agent.put(`/api/campaigns/${a}/members/999999`), gm.token).expect(404);

  const listed = (token: string) => asToken(agent.get("/api/campaigns"), token).expect(200)
    .then((response) => response.body.campaigns.map((campaign: { id: number }) => campaign.id));
  expect(await listed(gm.token)).toEqual([a, b]);
  expect(await listed(both.token)).toEqual([a, b]);
  expect(await listed(onlyA.token)).toEqual([a]);
  expect(await listed(onlyB.token)).toEqual([b]);

  const inA = await createEncounter(agent, gm.token, a, "Ambush at the ford");
  const inB = await createEncounter(agent, gm.token, b, "Wreck of the Gull");

  expect(await summaryNames(agent, gm.token, a)).toEqual([`${a}:Ambush at the ford`]);
  expect(await summaryNames(agent, gm.token, b)).toEqual([`${b}:Wreck of the Gull`]);
  expect(await summaryNames(agent, both.token, b)).toEqual([`${b}:Wreck of the Gull`]);

  // A direct read names the selected campaign; an encounter of another campaign is not found.
  const direct = await asToken(agent.get(`/api/dnd5e/encounters/${inA}/details?campaignId=${a}`), gm.token).expect(200);
  expect(direct.body.encounterDetails).toMatchObject({ id: inA, campaignId: a, name: "Ambush at the ford" });
  await asToken(agent.get(`/api/dnd5e/encounters/${inA}/details?campaignId=${b}`), gm.token).expect(404);
  await asToken(agent.get(`/api/dnd5e/encounters/${inB}/details`), gm.token).expect(400);

  // A player outside a campaign cannot read it, even by encounter ID.
  await asToken(agent.get(`/api/dnd5e/encounters/summaries?campaignId=${a}`), onlyB.token).expect(404);
  await asToken(agent.get(`/api/dnd5e/encounters/${inA}/details?campaignId=${a}`), onlyB.token).expect(404);
  await asToken(agent.get(`/api/dnd5e/encounters/summaries`), gm.token).expect(400);

  // Removing a member applies to their next request.
  await asToken(agent.delete(`/api/campaigns/${b}/members/${both.user.id}`), gm.token).expect(204);
  expect(await listed(both.token)).toEqual([a]);
  await asToken(agent.get(`/api/dnd5e/encounters/summaries?campaignId=${b}`), both.token).expect(404);
  await asToken(agent.delete(`/api/campaigns/${b}/members/${both.user.id}`), gm.token).expect(404);
});

test("creating an encounter needs an explicit, existing campaign", async () => {
  const agent = createHttpAgent();
  const gm = await createGm();
  const body = { data: { name: "Nowhere", description: "", location: "", difficulty: "", status: "planned" } };
  await asToken(agent.post("/api/dnd5e/encounters"), gm.token).send(body).expect(400);
  const missing = await asToken(agent.post("/api/dnd5e/encounters"), gm.token).send({ ...body, campaignId: 999999 }).expect(404);
  expect(missing.body.message).toBe("Campaign not found");
  await asToken(agent.post("/api/dnd5e/encounters"), gm.token).send({ ...body, campaignId: "1; DROP" }).expect(400);
});

test("only GMs administer campaigns; players see their memberships", async () => {
  const agent = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const lonely = await createPlayer();
  const id = await createCampaign(agent, gm.token, "Cinders");
  await asToken(agent.put(`/api/campaigns/${id}/members/${player.user.id}`), gm.token).expect(200);

  await asToken(agent.post("/api/campaigns"), player.token).send({ name: "Mine" }).expect(403);
  await asToken(agent.patch(`/api/campaigns/${id}`), player.token).send({ name: "Mine" }).expect(403);
  await asToken(agent.get(`/api/campaigns/${id}/members`), player.token).expect(403);
  await asToken(agent.put(`/api/campaigns/${id}/members/${lonely.user.id}`), player.token).expect(403);
  await asToken(agent.post("/api/dnd5e/encounters"), player.token).send({ campaignId: id, data: { name: "x" } }).expect(403);

  const edited = await asToken(agent.patch(`/api/campaigns/${id}`), gm.token).send({ description: "Ash and ember" }).expect(200);
  expect(edited.body.campaign).toMatchObject({ id, name: "Cinders", description: "Ash and ember", memberCount: 1 });
  await asToken(agent.post("/api/campaigns"), gm.token).send({ name: "   " }).expect(400);

  const mine = await asToken(agent.get("/api/campaigns"), player.token).expect(200);
  expect(mine.body.campaigns).toEqual([{ id, name: "Cinders", description: "Ash and ember" }]);
  const none = await asToken(agent.get("/api/campaigns"), lonely.token).expect(200);
  expect(none.body.campaigns).toEqual([]);
});
