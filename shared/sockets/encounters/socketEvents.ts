export enum EncounterSocketEvents {
    // Lifecycle
    JOIN = 'encounter:join',
    LEAVE = 'encounter:leave',
    /** The encounter was deleted; nothing more will arrive for it. */
    END = 'encounter:end',
    // Data sync
    REQUEST = 'encounter:request',
    OPERATION = 'encounter:operation',
    TEMPLATE_UPDATED = 'encounter:templateUpdated',
}
