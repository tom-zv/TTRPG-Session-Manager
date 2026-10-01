-- The encounter a campaign's players are shown: the one whose combat the GM last started there.
-- It stays after combat ends. A reset of that encounter removes the row, a deletion removes it
-- through the cascade, and the next start in the campaign replaces it; a reset or deletion of
-- another encounter leaves it alone. Opening prep or editing an encounter's status never changes
-- it. No row means the players are waiting. The engine writes it in the same transaction as the
-- snapshot of the start or reset, and copies campaign_id from the encounter row.
CREATE TABLE
  IF NOT EXISTS core.campaign_current_encounters (
    campaign_id INT PRIMARY KEY,
    encounter_id INT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_campaign_current_encounters_encounter (encounter_id),
    CONSTRAINT fk_campaign_current_encounters_campaign FOREIGN KEY (campaign_id) REFERENCES core.campaigns (id) ON DELETE CASCADE,
    CONSTRAINT fk_campaign_current_encounters_encounter FOREIGN KEY (encounter_id) REFERENCES core.encounters (id) ON DELETE CASCADE
  );
