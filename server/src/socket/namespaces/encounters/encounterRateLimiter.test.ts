import { afterEach, expect, test, vi } from "vitest";
import { EncounterRateLimiter } from "./encounterRateLimiter.js";

afterEach(() => vi.useRealTimers());

test("A user gets 20 requests in a rolling second and recovers at the boundary without affecting another user. (Stagger timestamps; denied attempts do not extend the window; cleanup resets only that user.)", () => {
  vi.useFakeTimers({ now: 1000 });
  const limiter = new EncounterRateLimiter();

  expect(limiter.isRateLimited("first")).toBe(false);
  vi.setSystemTime(1100);
  for (let index = 0; index < 19; index++) expect(limiter.isRateLimited("first")).toBe(false);
  expect(limiter.isRateLimited("first")).toBe(true);
  vi.setSystemTime(1999);
  expect(limiter.isRateLimited("first")).toBe(true);
  for (let index = 0; index < 20; index++) expect(limiter.isRateLimited("second")).toBe(false);
  expect(limiter.isRateLimited("second")).toBe(true);

  vi.setSystemTime(2000);
  expect(limiter.isRateLimited("first")).toBe(false);
  expect(limiter.isRateLimited("first")).toBe(true);
  vi.setSystemTime(2100);
  for (let index = 0; index < 19; index++) expect(limiter.isRateLimited("first")).toBe(false);
  expect(limiter.isRateLimited("first")).toBe(true);

  limiter.cleanup("first");
  expect(limiter.isRateLimited("second")).toBe(true);
  for (let index = 0; index < 20; index++) expect(limiter.isRateLimited("first")).toBe(false);
  expect(limiter.isRateLimited("first")).toBe(true);
});
