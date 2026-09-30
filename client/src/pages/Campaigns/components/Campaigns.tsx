import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CAMPAIGN_LIMITS, type CampaignDTO } from "shared/DTO/campaigns/types.js";
import { getUsers } from "src/api/usersApi.js";
import { USER_KEYS } from "src/api/query/keys.js";
import {
  useAddCampaignMember,
  useCampaignMembers,
  useCampaigns,
  useCreateCampaign,
  useRemoveCampaignMember,
  useUpdateCampaign,
} from "src/api/query/useCampaignQueries.js";
import styles from "./Campaigns.module.css";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

/** GM administration: every GM creates and edits campaigns and manages their rosters. */
export const Campaigns: React.FC = () => {
  const { data: campaigns, error, isLoading } = useCampaigns();

  return (
    <div className={`page-container ${styles.page}`}>
      <h2>Campaigns</h2>
      <CampaignForm />
      {error ? <p role="alert" className={styles.error}>{errorMessage(error)}</p>
        : isLoading ? <p>Loading campaigns…</p>
        : campaigns && campaigns.length > 0 ? (
          <ul className={styles.list}>
            {campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
          </ul>
        ) : <p className={styles.notice}>No campaigns yet.</p>}
    </div>
  );
};

/** Creates a campaign, or edits one when `campaign` is given. */
const CampaignForm: React.FC<{ campaign?: CampaignDTO; onDone?: () => void }> = ({ campaign, onDone }) => {
  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const create = useCreateCampaign();
  const update = useUpdateCampaign(campaign?.id ?? 0);
  const mutation = campaign ? update : create;
  const label = campaign ? `Edit ${campaign.name}` : "New campaign";

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const input = { name, description };
    if (campaign) {
      update.mutate(input, { onSuccess: () => onDone?.() });
    } else {
      create.mutate(input, { onSuccess: () => { setName(""); setDescription(""); } });
    }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit} aria-label={label}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={CAMPAIGN_LIMITS.name} required />
      </label>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={CAMPAIGN_LIMITS.description} />
      </label>
      <button type="submit" disabled={mutation.isPending || name.trim() === ""}>
        {campaign ? "Save" : "Create campaign"}
      </button>
      {campaign && <button type="button" onClick={onDone}>Cancel</button>}
      {mutation.error && <p role="alert" className={styles.error}>{errorMessage(mutation.error)}</p>}
    </form>
  );
};

const CampaignCard: React.FC<{ campaign: CampaignDTO }> = ({ campaign }) => {
  const [editing, setEditing] = useState(false);
  const players = campaign.memberCount ?? 0;

  return (
    <li className={styles.card} aria-labelledby={`campaign-${campaign.id}`}>
      {editing ? <CampaignForm campaign={campaign} onDone={() => setEditing(false)} /> : (
        <div className={styles.header}>
          <h3 id={`campaign-${campaign.id}`}>{campaign.name}</h3>
          <span className={styles.notice}>{players} {players === 1 ? "player" : "players"}</span>
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${campaign.name}`}>Edit</button>
        </div>
      )}
      {!editing && campaign.description && <p className={styles.notice}>{campaign.description}</p>}
      <Roster campaign={campaign} />
    </li>
  );
};

const Roster: React.FC<{ campaign: CampaignDTO }> = ({ campaign }) => {
  const { data: members, error } = useCampaignMembers(campaign.id);
  const { data: users } = useQuery({ queryKey: USER_KEYS.list(), queryFn: getUsers });
  const add = useAddCampaignMember(campaign.id);
  const remove = useRemoveCampaignMember(campaign.id);
  const [pick, setPick] = useState("");

  const memberIds = new Set(members?.map((member) => member.userId));
  const candidates = users?.filter((user) => !user.isGm && !memberIds.has(user.id)) ?? [];

  return (
    <section className={styles.roster} aria-label={`${campaign.name} players`}>
      {error && <p role="alert" className={styles.error}>{errorMessage(error)}</p>}
      {members && members.length === 0 && <p className={styles.notice}>No players yet.</p>}
      <ul className={styles.members}>
        {members?.map((member) => (
          <li key={member.userId}>
            <span>{member.username}</span>
            <button
              type="button"
              onClick={() => remove.mutate(member.userId)}
              disabled={remove.isPending}
              aria-label={`Remove ${member.username} from ${campaign.name}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (pick) add.mutate(Number(pick), { onSuccess: () => setPick("") });
        }}
      >
        <label>
          Add player to {campaign.name}
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a registered player…</option>
            {candidates.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!pick || add.isPending}>Add</button>
      </form>
      {(add.error || remove.error) && (
        <p role="alert" className={styles.error}>{errorMessage(add.error ?? remove.error)}</p>
      )}
    </section>
  );
};
