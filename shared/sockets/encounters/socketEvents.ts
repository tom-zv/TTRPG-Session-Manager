export enum EncounterSocketEvents {
    // Lifecycle
    INIT = 'encounter:init',
    JOIN = 'encounter:join',
    LEAVE = 'encounter:leave',
    END = 'encounter:end',
    // Data sync
    REQUEST = 'encounter:request',
    OPERATION = 'encounter:operation',
}