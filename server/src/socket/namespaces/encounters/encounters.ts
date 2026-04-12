import { Namespace } from "socket.io";
import { registerEncounterCommandHandlers } from "./encounterCommandHandlers.js";
import { registerEncounterLifecycleHandlers } from "./encounterLifecycleHandlers.js";

export const initEncounterHandlers = (namespace: Namespace): void => {
  namespace.on("connection", (socket) => {
    console.log(`User ${socket.data.user?.username} connected to encounters`);
    registerEncounterLifecycleHandlers(namespace, socket);
    registerEncounterCommandHandlers(namespace, socket);
  });
};
