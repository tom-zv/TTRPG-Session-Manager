import React, { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import type { CampaignDTO } from "shared/DTO/campaigns/types.js";
import { useCampaignSelection } from "src/app/contexts/CampaignSelectionContext.js";
import { encounterPaths, parseEncounterPath } from "src/app/campaignSelection.js";
import { CampaignChooser, CampaignUnavailable } from "src/components/CampaignChooser/CampaignChooser.js";
import { useCurrentEncounter, useEncounterHistory } from "src/api/query/useCampaignQueries.js";
import { LiveEncounter } from "./dnd5e/LiveEncounter/LiveEncounterView.js";
import styles from "./PlayerEncounter.module.css";

/**
 * A player's Encounter destination for the selected campaign: the board of the campaign's current
 * encounter, or a waiting message when the GM has not started one. Which board is shown follows the
 * stored selection only; combat updates arrive on that board's own socket session.
 *
 * `/encounter-manager/:campaignId/:encounterId` opens one of the campaign's past fights instead,
 * read-only. It is only reached explicitly, from the past-fights menu; the Encounter tab and
 * "Open encounter" lead back to the current board.
 */
export const PlayerEncounter: React.FC = () => {
  const { pathname } = useLocation();
  const route = parseEncounterPath(pathname);
  const { selected, urlUnavailable } = useCampaignSelection();

  if (route?.campaignId === null && selected) return <Navigate replace to={encounterPaths.campaign(selected.id)} />;
  if (route && urlUnavailable) return <div className="page-container"><CampaignUnavailable /></div>;
  if (!selected) return <div className="page-container"><CampaignChooser isGm={false} /></div>;

  // Keyed by campaign: nothing of another campaign's answer or board survives a switch.
  return <CampaignBoard key={selected.id} campaign={selected} pastEncounterId={route?.encounterId ?? null} />;
};

const CampaignBoard: React.FC<{ campaign: CampaignDTO; pastEncounterId: number | null }> = ({ campaign, pastEncounterId }) => (
  <>
    <PastFightsMenu campaign={campaign} viewingId={pastEncounterId} />
    {pastEncounterId === null
      ? <CurrentBoard campaign={campaign} />
      : <PastBoard key={pastEncounterId} campaign={campaign} encounterId={pastEncounterId} />}
  </>
);

const CurrentBoard: React.FC<{ campaign: CampaignDTO }> = ({ campaign }) => {
  const current = useCurrentEncounter(campaign.id);

  if (current.isError && current.data === undefined) {
    return (
      <section className="page-container" role="alert">
        <p>Could not load {campaign.name}&apos;s encounter: {current.error.message}</p>
        <button type="button" onClick={() => void current.refetch()} disabled={current.isFetching}>Try again</button>
      </section>
    );
  }
  if (current.data === undefined) return <div className="page-container">Loading {campaign.name}…</div>;
  if (current.data === null) {
    return (
      <section className="page-container" aria-labelledby="player-encounter-heading">
        <h2 id="player-encounter-heading">{campaign.name}</h2>
        <p role="status">Waiting for the GM to start an encounter.</p>
      </section>
    );
  }

  const encounter = current.data;
  // Keyed by encounter: a new start replaces the session, so packets of the old board are dropped.
  return (
    <LiveEncounter
      key={encounter.id}
      system={encounter.system}
      campaignId={campaign.id}
      encounterId={encounter.id}
      isGm={false}
      playerBoard={{ details: encounter }}
    />
  );
};

/** One past fight, read-only. Anything that is not (or no longer) in the campaign's history is refused. */
const PastBoard: React.FC<{ campaign: CampaignDTO; encounterId: number }> = ({ campaign, encounterId }) => {
  const history = useEncounterHistory(campaign.id);
  const encounter = history.data?.find((candidate) => candidate.id === encounterId);

  if (history.isError && history.data === undefined) {
    return (
      <section className="page-container" role="alert">
        <p>Could not load {campaign.name}&apos;s past fights: {history.error.message}</p>
        <button type="button" onClick={() => void history.refetch()} disabled={history.isFetching}>Try again</button>
      </section>
    );
  }
  if (history.data === undefined) return <div className="page-container">Loading {campaign.name}…</div>;
  if (!encounter) {
    return (
      <section className="page-container" role="status">
        <p>This encounter is not one of {campaign.name}&apos;s past fights.</p>
      </section>
    );
  }
  return (
    <LiveEncounter
      system={encounter.system}
      campaignId={campaign.id}
      encounterId={encounter.id}
      isGm={false}
      playerBoard={{ details: encounter, history: true }}
    />
  );
};

/**
 * The way into the campaign's history, and back to the current board while a past fight is open.
 * The list is read again each time it is opened, since a fight that was not on this player's board
 * may have ended meanwhile.
 */
const PastFightsMenu: React.FC<{ campaign: CampaignDTO; viewingId: number | null }> = ({ campaign, viewingId }) => {
  const history = useEncounterHistory(campaign.id);
  const [open, setOpen] = useState(false);
  const listId = `past-fights-${campaign.id}`;

  return (
    <nav className={styles.pastFights} aria-label={`${campaign.name} encounters`}>
      {viewingId !== null && (
        <Link to={encounterPaths.campaign(campaign.id)} className={styles.backLink}>
          ← Current encounter
        </Link>
      )}
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (!open) void history.refetch();
          setOpen(!open);
        }}
      >
        Past fights
      </button>
      {open && (
        <div id={listId} className={styles.list}>
          {history.data === undefined ? (
            <p>{history.isError ? `Could not load past fights: ${history.error.message}` : "Loading…"}</p>
          ) : history.data.length === 0 ? (
            <p>No fight in {campaign.name} has ended yet.</p>
          ) : (
            <ul>
              {history.data.map((encounter) => (
                <li key={encounter.id}>
                  <Link
                    to={encounterPaths.encounter(campaign.id, encounter.id)}
                    aria-current={encounter.id === viewingId ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {encounter.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
};
