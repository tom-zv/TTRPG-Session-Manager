import { DnD5eLocalStateManager } from "../DnD5eLocalStateManager.js"

export class DnD5eStatActions {
    constructor(
        private stateManager: DnD5eLocalStateManager, 
        private encounterId: number
    ) {}

    setInitiative(entityId: number, initiative: number): void {
        this.stateManager.applyLocalEvent(this.encounterId, {
            type: "setInitiative",
            values: { targetId: entityId, initiative },
        });
    }
    
}