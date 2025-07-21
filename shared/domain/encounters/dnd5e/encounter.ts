import { CoreEncounter } from "../coreEncounter.js";
import { DnD5eEntity } from "./entity.js";

export interface Dnd5eEncounter extends CoreEncounter {
    encounterEntities: DnD5eEntity[];
}