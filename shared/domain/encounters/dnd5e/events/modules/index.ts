import { EntityHandlerMap, GlobalHandlerMap } from "../types.js";
import { hpHandlers } from "./hp.js";
import { statHandlers } from "./stats.js";
import { globalHandler } from "./global.js";

export const EntityHandlers: EntityHandlerMap = {
    ...hpHandlers,
    ...statHandlers
}

export const GlobalHandlers: GlobalHandlerMap = {
    ...globalHandler
}