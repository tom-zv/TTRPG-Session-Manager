// Core encounter engine exports
export { IEncounterEngine, BaseEncounterEngine, createEncounterEngine } from './encounterEngine.js';
export { EncounterEngineManager } from './encounterEngineManager.js';

// Default manager instance
export { default as encounterEngineManager } from './encounterEngineManager.js';

// request and state cache interfaces
export type { IRequestHandler } from './requestHandler.js';
export type { IStateCache } from './stateCache.js';
