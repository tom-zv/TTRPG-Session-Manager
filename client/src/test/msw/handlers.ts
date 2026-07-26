import { HttpResponse, type JsonBodyType } from "msw";

/**
 * Default handlers shared by every client test. Keep this empty or near-empty: tests declare the
 * requests they expect with `server.use(http.get("/api/...", () => json(...)))`.
 */
export const handlers = [];

/** A JSON success response. */
export const json = <T extends JsonBodyType>(body: T, status = 200) => HttpResponse.json(body, { status });

/** An error response in the shape the API modules read: `{ message }`. */
export const apiError = (status: number, message: string) => HttpResponse.json({ message }, { status });
