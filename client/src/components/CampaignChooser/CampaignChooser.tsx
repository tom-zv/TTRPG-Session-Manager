import React from "react";
import { Link } from "react-router-dom";
import { useCampaignSelection } from "src/app/contexts/CampaignSelectionContext.js";
import styles from "./CampaignChooser.module.css";

/**
 * What the encounter section shows before a campaign is resolved: loading, a failed read, no
 * campaign at all (a player waits to be added; a GM creates one) or a list to choose from.
 */
export const CampaignChooser: React.FC<{ isGm: boolean }> = ({ isGm }) => {
  const { campaigns, error, select } = useCampaignSelection();

  if (error) return <p role="alert" className={styles.notice}>Could not load campaigns: {error.message}</p>;
  if (!campaigns) return <p className={styles.notice}>Loading campaigns…</p>;
  if (campaigns.length === 0) {
    return isGm ? (
      <p className={styles.notice}>No campaigns yet. <Link to="/campaigns">Create one</Link> to prepare encounters.</p>
    ) : (
      <p role="status" className={styles.notice}>Waiting for your GM to add you to a campaign.</p>
    );
  }

  return (
    <section className={styles.chooser} aria-labelledby="campaign-chooser-heading">
      <h2 id="campaign-chooser-heading">Choose a campaign</h2>
      <ul className={styles.list}>
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <button type="button" onClick={() => select(campaign.id)}>{campaign.name}</button>
            {campaign.description && <span className={styles.description}>{campaign.description}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** A URL named a campaign this account cannot open. Nothing of it is read or shown. */
export const CampaignUnavailable: React.FC = () => {
  const { selected } = useCampaignSelection();
  return (
    <div role="alert" className={styles.notice}>
      <p>This campaign is not available to you.</p>
      {selected && <Link to={`/encounter-manager/${selected.id}`}>Open {selected.name}</Link>}
    </div>
  );
};
