// Core encounter engine exports
export { IEncounterEngine, BaseEncounterEngine } from './encounterEngine.js';
export { EncounterEngineManager } from './encounterEngineManager.js';
export { loadEncounterEngine, EncounterNotFoundError } from './encounterSystems.js';

// Default manager instance
export { default as encounterEngineManager } from './encounterEngineManager.js';

// request interfaces
export type { IRequestHandler } from './requestHandler.js';
