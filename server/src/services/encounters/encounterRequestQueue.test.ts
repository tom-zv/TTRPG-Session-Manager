import { setImmediate } from "node:timers/promises";
import { expect, test } from "vitest";
import { EncounterRequestQueue } from "./encounterRequestQueue.js";

test("Requests for one encounter run in arrival order without overlap and return their own task results.", async () => {
  const queue = new EncounterRequestQueue();
  const steps: string[] = [];
  let release!: () => void;
  const holdFirst = new Promise<void>((resolve) => { release = resolve; });

  const first = queue.enqueue(12, async () => {
    steps.push("first started");
    await holdFirst;
    steps.push("first finished");
    return "first result";
  });
  const second = queue.enqueue(12, async () => {
    steps.push("second ran");
    return 42;
  });
  const third = queue.enqueue(12, async () => {
    steps.push("third ran");
    return { completed: true };
  });

  try {
    await setImmediate();
    expect(steps).toEqual(["first started"]);
  } finally {
    release();
    await Promise.all([first, second, third]);
  }

  expect(await Promise.all([first, second, third])).toEqual(["first result", 42, { completed: true }]);
  expect(steps).toEqual(["first started", "first finished", "second ran", "third ran"]);
});

test("A blocked encounter does not delay tasks for a different encounter.", async () => {
  const queue = new EncounterRequestQueue();
  const completed: string[] = [];
  let release!: () => void;
  const holdFirst = new Promise<void>((resolve) => { release = resolve; });

  const first = queue.enqueue(12, async () => {
    await holdFirst;
    completed.push("encounter 12");
  });
  const other = queue.enqueue(13, async () => {
    completed.push("encounter 13");
    return "other result";
  });

  try {
    await setImmediate();
    expect(completed).toEqual(["encounter 13"]);
    expect(await other).toBe("other result");
  } finally {
    release();
    await Promise.all([first, other]);
  }

  expect(completed).toEqual(["encounter 13", "encounter 12"]);
});

test("A rejected task reaches its caller without an unhandled tail and does not block queued or later work.", async () => {
  const queue = new EncounterRequestQueue();
  const failure = new Error("Request rejected");
  const steps: string[] = [];
  const rejected = queue.enqueue(12, async () => {
    steps.push("failed");
    throw failure;
  });
  const queued = queue.enqueue(12, async () => {
    steps.push("queued");
    return "queued result";
  });

  await expect(rejected).rejects.toBe(failure);
  await expect(queued).resolves.toBe("queued result");
  expect(steps).toEqual(["failed", "queued"]);

  const rejectedWithoutSuccessor = queue.enqueue(12, async () => { throw failure; });
  await expect(rejectedWithoutSuccessor).rejects.toBe(failure);
  // Yield through Node's unhandled-rejection checkpoint so Vitest can report a leaked tail.
  await setImmediate();
  await expect(queue.enqueue(12, async () => "later result")).resolves.toBe("later result");
});
