import { SystemType } from "shared/domain/encounters/coreEncounter.js";

export type gm_note =  {
    text: string
    timestamp: string
}

export type EncounterDB = {
    id: number,
    system: SystemType,
    campaign_id: number,
    name: string,
    description: string,
    status: 'planned' | 'active' | 'completed',
    location: string, 
    difficulty: string,
    gm_notes: gm_note[],
    created_at: string,
    /** Total entity copies in the encounter. Only selected by list queries. */
    entity_count?: number | string,
}

export type EncounterInsertData = {
    system_id: number;
    campaign_id: number;
    name: string;
    description?: string | null;
    location?: string | null;
    difficulty?: string | null;
    gm_notes: gm_note[];
}; 

/** Metadata a GM may change; the campaign and system are fixed at creation. */
export type encounterUpdateDataDB = Partial<Omit<EncounterDB, 'id' | 'system' | 'campaign_id' | 'created_at' | 'entity_count'>>;