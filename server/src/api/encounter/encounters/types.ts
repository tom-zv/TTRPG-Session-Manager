import { SystemType } from "shared/domain/encounters/coreEncounter.js";

export type gm_note =  {
    text: string
    timestamp: string
}

export type EncounterDB = {
    id: number,
    system: SystemType,
    name: string,
    description: string,
    status: 'planned' | 'active' | 'completed',
    location: string, 
    difficulty: string,
    gm_notes: gm_note[],
    created_at: string,
}

export type EncounterInsertData = {
    system_id: number;
    name: string;
    description?: string | null;
    location?: string | null;
    difficulty?: string | null;
    gm_notes: gm_note[];
}; 

export type encounterUpdateDataDB = Partial<EncounterDB>;