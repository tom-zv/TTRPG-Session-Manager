import { DnD5eEncounterEvent, EntityEvent } from "shared/domain/encounters/dnd5e/events/types.js";

export type Versioned<T> = T & { version: number };

// A union type for all supported system encounter events
export type AnySystemEncounterEvent = Versioned<DnD5eEncounterEvent>;

export function isEntityEvent(e: AnySystemEncounterEvent): e is Versioned<EntityEvent> {
    return 'targetId' in e.values;
}

