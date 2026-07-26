import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

/** One MSW server for the client project. Tests add handlers with `server.use(...)`. */
export const server = setupServer(...handlers);
