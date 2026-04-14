import { DnD5eEncounterEvent, isEntityEvent } from "shared/domain/encounters/dnd5e/events/types.js";

/**
 * Type guard to check if an event is a valid DnD5e event
 */
export function isDnD5eEvent(event: unknown): event is DnD5eEncounterEvent {
    if (!event || typeof event !== 'object') {
        return false;
    }

    const e = event as Record<string, unknown>;
    
    // Check required base properties
    if (typeof e.type !== 'string' || !e.values || typeof e.values !== 'object') {
        return false;
    }

    // Validate based on event type
    const values = e.values as Record<string, unknown>;
    
    switch (e.type) {
        case 'addEntity':
            return (
                typeof values.templateId === 'number' &&
                typeof values.name === 'string' &&
                typeof values.hp === 'number'
            );
        case 'removeEntity':
            return typeof values.instanceId === 'number';
        case 'damage':
        case 'heal':
            return (
                typeof values.targetId === 'number' &&
                typeof values.sourceId === 'number' &&
                typeof values.amount === 'number'
            );
        case 'setHp':
        case 'setCurrentHp':
            return (
                typeof values.targetId === 'number' &&
                typeof values.hp === 'number'
            );
        case 'setTempHp':
            return (
                typeof values.targetId === 'number' &&
                typeof values.sourceId === 'number' &&
                typeof values.tempHp === 'number'
            );
        case 'setInitiative':
            return (
                typeof values.targetId === 'number' &&
                typeof values.initiative === 'number'
            );
        default:
            return false;
    }
}

/**
 * Validate a DnD5e event, throwing Error if invalid
 */
export function validateDnD5eEvent(event: DnD5eEncounterEvent): DnD5eEncounterEvent {
    if (!isDnD5eEvent(event)) {
        throw new Error(
            `Invalid DnD5e event: missing required fields or incorrect types`
        );
    }

    // Additional business logic validation
    const e = event as DnD5eEncounterEvent;
    
    if (isEntityEvent(e)) {
        // Entity-targeted events must have a valid targetId
        if (e.values.targetId <= 0) {
            throw new Error(`Invalid targetId: must be a positive number, got ${e.values.targetId}`);
        }
    }

    // Validate specific field constraints
    if (e.type === 'addEntity') {
        if (e.values.hp <= 0) {
            throw new Error(`Invalid hp for addEntity: must be positive, got ${e.values.hp}`);
        }
        if (!e.values.name || e.values.name.trim().length === 0) {
            throw new Error('Invalid name for addEntity: name cannot be empty');
        }
    }

    if (e.type === 'setHp' || e.type === 'setCurrentHp') {
        if (e.values.hp < 0) {
            throw new Error(`Invalid hp: cannot be negative, got ${e.values.hp}`);
        }
    }

    return e;
}
