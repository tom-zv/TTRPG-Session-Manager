import { EntityHandlerMap, GlobalHandlerMap } from "../types.js";
import { hpHandlers } from "./hp.js";
import { statHandlers } from "./stats.js";
import { globalHandler } from "./global.js";
import { graveHandlers } from "./grave.js";

export const EntityHandlers: EntityHandlerMap = {
    ...hpHandlers,
    ...graveHandlers,
    ...statHandlers
}

export const GlobalHandlers: GlobalHandlerMap = {
    ...globalHandler
}
