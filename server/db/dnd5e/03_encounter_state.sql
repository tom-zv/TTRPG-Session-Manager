-- Encounter snapshot for persisted encounter state
CREATE TABLE
  IF NOT EXISTS dnd5e.encounter_snapshots (
    encounter_id INT PRIMARY KEY,

    snapshot JSON NULL COMMENT 'Complete encounter state snapshot. Structure: {
      "version": number,
      "phase": "setup" | "running" | "ended",
      "currentRound": number,
      "currentTurn": number,
      "settings": {"automation": {"zeroHpTransfer": "manual"}, "visibility": {"monsterHp": "status"}},
      "initiativeOrder": number[],
      "nextInstanceId": number,
      "entityStates": [{
        "instanceId": number,
        "templateId": number,
        "inGrave": boolean,
        "hidden": boolean,
        "initiative": number,
        "maxHp": number,
        "currentHp": number,
        "tempHp": number,
        "isConcentrating": boolean,
        "deathSaveSuccesses": number,
        "deathSaveFailures": number,
        "reactionUsed": boolean,
        "conditions": [{"name": string, "duration": number, "startedOnRound": number}]
      }]
    }',

    snapshot_at TIMESTAMP NULL,
    
    CONSTRAINT fk_dnd5e_encounter_snapshots 
      FOREIGN KEY (encounter_id) 
      REFERENCES core.encounters (id) ON DELETE CASCADE
  );
