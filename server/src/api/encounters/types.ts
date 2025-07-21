export type dm_note =  {
    text: string
    timestamp: string
}

export type EncounterDB = {
    id: number,
    name: string,
    description: string,
    status: 'planned' | 'active' | 'completed',
    location: string, 
    difficulty: string,
    round_count: number,
    dm_notes: dm_note[],
    created_at: string,
}

export type EncounterInsertData = {
    name: string;
    description?: string;
    location?: string;
    difficulty?: string;
}; 

export type encounterUpdateDataDB = Partial<EncounterDB>;