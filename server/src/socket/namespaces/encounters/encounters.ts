import { Namespace } from "socket.io";
import { registerEncounterRequestHandlers } from "./encounterRequestHandlers.js";
import { registerEncounterLifecycleHandlers } from "./encounterLifecycleHandlers.js";

export const initEncounterHandlers = (namespace: Namespace): void => {
  namespace.on("connection", (socket) => {
    console.log(`User ${socket.data.user?.username} connected to encounters`);
    
    registerEncounterLifecycleHandlers(namespace, socket);
    registerEncounterRequestHandlers(namespace, socket);
  });
};
