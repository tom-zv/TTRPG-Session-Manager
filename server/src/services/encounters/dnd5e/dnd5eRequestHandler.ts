import { BaseRequestHandler } from "../requestHandler.js";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent, isEntityEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEventProcessor } from "shared/domain/encounters/dnd5e/events/EventProcessor.js";
import { validateDnD5eEvent } from "./dnd5eEventValidator.js";
import { authorizeDnD5eEvent } from "./dnd5eEventAuth.js";
import { controlsEntity, hpDisplayFor } from "shared/domain/encounters/dnd5e/view.js";
import { UserDB } from "src/api/users/types.js";
import { usesDeathSaves } from "shared/domain/encounters/dnd5e/settings.js";
import { EntityCombatProfile, getCombatProfiles } from "src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";

export type CombatProfileLoader = (ids: number[]) => Promise<EntityCombatProfile[]>;
const hpEvents = new Set<DnD5eEncounterEvent["type"]>(["damage", "heal", "setHp", "setCurrentHp"]);

export class DnD5eRequestHandler extends BaseRequestHandler<DnD5eEncounterState> {
    private profiles = new Map<number, EntityCombatProfile>();
    private isGm = false;

    constructor(state: DnD5eEncounterState, private readonly loadProfiles: CombatProfileLoader = getCombatProfiles) {
        super(state);
    }

    /** Load the template facts this request depends on: rules for HP changes, ownership for players. */
    protected async prepareEvents(events: DnD5eEncounterEvent[], user: UserDB): Promise<void> {
        this.isGm = Boolean(user.is_gm);
        const instanceIds = new Set<number>();
        const templateIds = new Set<number>();
        for (const event of events) {
            if (event.type === "addEntity") templateIds.add(event.values.templateId);
            const needsProfile = hpEvents.has(event.type) || event.type === "setDeathSaves";
            if (needsProfile && isEntityEvent(event)) instanceIds.add(event.values.targetId);
        }
        for (const entity of this.state.entityStates) {
            // A player's request is checked against who controls every entity and its role: damage
            // and healing depend on having a combatant of one's own in play.
            if (!this.isGm || instanceIds.has(entity.instanceId)) templateIds.add(entity.templateId);
        }
        if (!templateIds.size) return;
        this.profiles = new Map((await this.loadProfiles([...templateIds])).map((profile) => [profile.id, profile]));
    }

    protected authorizeEvent(event: DnD5eEncounterEvent, user: UserDB): void {
        const viewer = { userId: user.id, isGm: Boolean(user.is_gm) };
        authorizeDnD5eEvent({
            state: this.state,
            isGm: viewer.isGm,
            controls: (instanceId) => {
                if (viewer.isGm) return true;
                const profile = this.profileOf(instanceId);
                return Boolean(profile && controlsEntity(viewer, profile));
            },
            // A player's view of the entity's HP; unknown templates count as concealed.
            hpDisplay: (instanceId) => {
                if (viewer.isGm) return "exact";
                const profile = this.profileOf(instanceId);
                return profile ? hpDisplayFor(viewer, profile, this.state.settings) : "hidden";
            },
        }, event);
    }

    private profileOf(instanceId: number): EntityCombatProfile | undefined {
        const entity = this.state.entityStates.find((candidate) => candidate.instanceId === instanceId);
        return entity && this.profiles.get(entity.templateId);
    }

    protected applyValidatedEvent(requested: DnD5eEncounterEvent): DnD5eEncounterEvent[] {
        this.assertAllowedInPhase(requested);
        const event = this.resolveFromTemplate(requested);
        const entity = isEntityEvent(event) ? this.findEntity(event.values.targetId) : undefined;
        const previousHp = entity?.currentHp;
        const profile = entity && this.profiles.get(entity.templateId);
        // A player only touches the death saves of a character that is making them, clearing included.
        if (event.type === "setDeathSaves" && (event.values.successes || event.values.failures || !this.isGm)) {
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

    /** Turn flow only makes sense in the matching phase; everything else is allowed throughout. */
    private assertAllowedInPhase(event: DnD5eEncounterEvent): void {
        const { phase } = this.state;
        if (event.type === "startCombat") {
            if (phase !== "setup") throw new Error("Combat has already started");
            if (this.state.initiativeOrder.length === 0) throw new Error("Add at least one entity before starting combat");
        }
        if (event.type === "endCombat" && phase !== "running") throw new Error("Combat is not running");
        if (event.type === "nextTurn" && phase !== "running") throw new Error("Combat is not running");
    }

    /**
     * A new entity takes its name and HP from the stored template, not from the client. A player
     * character also brings the HP it left its last combat with.
     */
    private resolveFromTemplate(event: DnD5eEncounterEvent): DnD5eEncounterEvent {
        if (event.type !== "addEntity") return event;
        const profile = this.profiles.get(event.values.templateId);
        if (!profile) throw new Error(`Entity template ${event.values.templateId} not found`);
        return {
            type: "addEntity",
            values: {
                templateId: profile.id,
                name: profile.name,
                hp: profile.hp,
                ...(profile.role === "pc" && profile.currentHp !== null ? { currentHp: Math.min(profile.currentHp, profile.hp) } : {}),
                ...(event.values.hidden ? { hidden: true } : {}),
            },
        };
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
