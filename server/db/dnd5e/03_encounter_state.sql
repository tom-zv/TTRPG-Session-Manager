-- Encounter snapshots for planning and active sessions
CREATE TABLE
  IF NOT EXISTS dnd5e.encounter_snapshots (
    encounter_id INT PRIMARY KEY,
    
    -- Snapshot for planning/restart
    initial_snapshot JSON NULL COMMENT 'Complete initial state snapshot. Structure: {
      "version": number,
      "currentRound": number,
      "currentTurn": number,
      "initiativeOrder": number,
      "entities": [{
        "entityId": number,
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
    
    -- Snapshot for persistence
    active_snapshot JSON NULL COMMENT 'Complete in-progress state snapshot. Same structure as initial_snapshot',
    
    initial_snapshot_at TIMESTAMP NULL,
    active_snapshot_at TIMESTAMP NULL,
    
    CONSTRAINT fk_dnd5e_encounter_snapshots 
      FOREIGN KEY (encounter_id) 
      REFERENCES core.encounters (id) ON DELETE CASCADE
  );
