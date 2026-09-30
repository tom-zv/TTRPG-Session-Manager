-- A campaign is one table of players: a long campaign, a one-shot or a separate group. Every
-- encounter belongs to exactly one campaign. The GM role is installation-wide (core.users.is_gm):
-- any GM administers every campaign and is never a member row. A player reaches a campaign only
-- through a row in campaign_members.
CREATE TABLE
  IF NOT EXISTS core.campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    created_by INT NULL COMMENT 'The GM who created it; informational, grants nothing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_campaigns_created_by FOREIGN KEY (created_by) REFERENCES core.users (id) ON DELETE SET NULL
  );

-- Which registered players belong to a campaign. Admission only: which entities a player controls
-- stays in core.user_entities.
CREATE TABLE
  IF NOT EXISTS core.campaign_members (
    campaign_id INT NOT NULL,
    user_id INT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (campaign_id, user_id),
    KEY idx_campaign_members_user (user_id),
    CONSTRAINT fk_campaign_members_campaign FOREIGN KEY (campaign_id) REFERENCES core.campaigns (id) ON DELETE CASCADE,
    CONSTRAINT fk_campaign_members_user FOREIGN KEY (user_id) REFERENCES core.users (id) ON DELETE CASCADE
  );
