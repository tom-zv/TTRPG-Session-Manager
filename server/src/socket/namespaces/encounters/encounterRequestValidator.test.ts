import { expect, test } from "vitest";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { damage, encounterRequest } from "../../../../tests/fixtures/encounters.js";
import { validateRequest } from "./encounterRequestValidator.js";

test("Malformed request envelopes return INVALID_REQUEST without throwing. (Null, primitive, invalid encounter ID, empty ID, absent or empty event array.)", () => {
  const valid = encounterRequest([damage(0, 1)]);
  const { encounterId, requestId, requestedEvents } = valid;
  const malformed = [
    null, undefined, 1, "request", {},
    { encounterId, requestId }, { encounterId, requestedEvents }, { requestId, requestedEvents },
    ...[0, -1, 1.5, NaN, Infinity, "12"].map((encounterId) => ({ ...valid, encounterId })),
    { ...valid, requestId: "" }, { ...valid, requestId: 1 },
    { ...valid, requestedEvents: [] }, { ...valid, requestedEvents: {} },
  ];

  for (const payload of malformed) {
    expect(validateRequest(payload)).toMatchObject({ valid: false, code: EncounterErrorCode.INVALID_REQUEST });
  }
});

test("A valid request envelope accepts a nonempty event array without requiring optional baseVersion or createdAt metadata.", () => {
  const { encounterId, requestId } = encounterRequest([]);
  expect(validateRequest({ encounterId, requestId, requestedEvents: [damage(0, 1)] })).toEqual({ valid: true });
  expect(validateRequest({ encounterId, requestId, requestedEvents: [null] })).toEqual({ valid: true });
});
