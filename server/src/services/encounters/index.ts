// Core encounter engine exports
export { IEncounterEngine, BaseEncounterEngine, createEncounterEngine } from './encounterEngine.js';
export { EncounterEngineManager } from './encounterEngineManager.js';

// Default manager instance
export { default as encounterEngineManager } from './encounterEngineManager.js';

// Command and state cache interfaces
export type { ICommandHandler } from './commandHandler.js';
export type { IStateCache, VersionedEvent } from './stateCache.js';
