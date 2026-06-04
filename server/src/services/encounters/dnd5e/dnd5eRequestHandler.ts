import { BaseRequestHandler } from "../requestHandler.js";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent, isEntityEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEventProcessor } from "shared/domain/encounters/dnd5e/events/EventProcessor.js";
import { validateDnD5eEvent } from "./dnd5eEventValidator.js";
import { IEventAuthorizer } from "../requestHandler.js";
import { usesDeathSaves } from "shared/domain/encounters/dnd5e/settings.js";
import { EntityCombatProfile, getCombatProfiles } from "src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";

export type CombatProfileLoader = (ids: number[]) => Promise<EntityCombatProfile[]>;
const hpEvents = new Set<DnD5eEncounterEvent["type"]>(["damage", "heal", "setHp", "setCurrentHp"]);

export class DnD5eRequestHandler extends BaseRequestHandler<DnD5eEncounterState> {
    private profiles = new Map<number, EntityCombatProfile>();

    constructor(state: DnD5eEncounterState, eventAuthorizer: IEventAuthorizer, private readonly loadProfiles: CombatProfileLoader = getCombatProfiles) {
        super(state, eventAuthorizer);
    }

    protected async prepareEvents(events: DnD5eEncounterEvent[]): Promise<void> {
        const needsProfiles = events.some((event) => hpEvents.has(event.type) || event.type === "setDeathSaves");
        if (!needsProfiles) return;
        const targetIds = new Set(events.filter((event) => hpEvents.has(event.type) || event.type === "setDeathSaves")
            .filter(isEntityEvent).map((event) => event.values.targetId));
        const ids = new Set(this.state.entityStates.filter((entity) => targetIds.has(entity.instanceId)).map((entity) => entity.templateId));
        for (const event of events) {
            if (event.type === "addEntity") ids.add(event.values.templateId);
        }
        this.profiles = new Map((await this.loadProfiles([...ids])).map((profile) => [profile.id, profile]));
    }

    protected applyValidatedEvent(event: DnD5eEncounterEvent): DnD5eEncounterEvent[] {
        const entity = isEntityEvent(event) ? this.findEntity(event.values.targetId) : undefined;
        const previousHp = entity?.currentHp;
        const profile = entity && this.profiles.get(entity.templateId);
        if (event.type === "setDeathSaves" && (event.values.successes || event.values.failures)) {
            if (!entity || entity.inGrave || entity.currentHp !== 0 || !profile || !usesDeathSaves(profile)) {
                throw new Error("Death saves require an active PC or opted-in NPC at 0 HP");
            }
        }
        if (entity && hpEvents.has(event.type) && !profile) {
            throw new Error(`Entity template ${entity.templateId} not found`);
        }
        this.applyEvent(event);
        const applied = [event];
        if (entity && hpEvents.has(event.type) && previousHp !== undefined && previousHp > 0 && entity.currentHp === 0 &&
            !entity.inGrave && this.state.settings.automation.zeroHpTransfer === "auto" &&
            profile && !usesDeathSaves(profile) && (profile.role === "npc" || profile.role === "creature")) {
            const burial: DnD5eEncounterEvent = { type: "moveToGrave", values: { targetId: entity.instanceId } };
            this.applyEvent(burial);
            applied.push(burial);
        }
        return applied;
    }

    protected validateEvent(event: DnD5eEncounterEvent): DnD5eEncounterEvent {
        return validateDnD5eEvent(event);
    }

    protected applyEvent(event: DnD5eEncounterEvent): void {
        DnD5eEventProcessor.applyEvent(this.state, event);
    }

    protected findEntity(entityId: number) {
        const entity = this.state.entityStates.find((e) => e.instanceId === entityId);
        if (!entity) throw new Error(`Entity ${entityId} not found`);
        return entity;
    }
}
