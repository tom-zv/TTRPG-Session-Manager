import { useCampaignSelection } from 'src/app/contexts/CampaignSelectionContext.js';

/** The shell's campaign switcher. Choosing records the campaign for this account in this browser. */
const CampaignSwitcher = () => {
  const { campaigns, error, selected, select } = useCampaignSelection();

  if (error) return <span className="campaign-switcher-note" role="status">Campaigns unavailable</span>;
  if (!campaigns) return null;
  if (campaigns.length === 0) return <span className="campaign-switcher-note">No campaign</span>;

  return (
    <select
      className="campaign-switcher"
      aria-label="Campaign"
      value={selected?.id ?? ''}
      onChange={(event) => select(Number(event.target.value))}
    >
      {selected === null && <option value="" disabled>Choose a campaign</option>}
      {campaigns.map(campaign => (
        <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
      ))}
    </select>
  );
};

export default CampaignSwitcher;
