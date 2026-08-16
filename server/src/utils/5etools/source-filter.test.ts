import { describe, expect, test } from "vitest";
import { createSourceFilter, defaultExclusions } from "./source-filter.js";

describe("source selection", () => {
  test("every default exclusion group is left out with its reason, and one group or source can be kept again", () => {
    const records = [
      { name: "Goblin", source: "MM" },
      { name: "Vampire Spawn", source: "PSI" },
      { name: "Mr. Meeseeks", source: "RMBRE" },
      { name: "Candy Golem", source: "NRH-TCMC" },
      { name: "Goblin Warrior", source: "XMM" },
    ];
    const reasons = (filter = createSourceFilter()) => records.map(record => filter.reject(record));

    expect(reasons()).toEqual([
      "excluded source MM (2014 core book)",
      "excluded source PSI (Plane Shift)",
      "excluded source RMBRE (novelty crossover)",
      "excluded source NRH-TCMC (children's book)",
      undefined,
    ]);
    const keepPlaneShiftAndRickAndMorty = createSourceFilter({ exclude: defaultExclusions(["plane-shift", "rmbre"]) });
    expect(reasons(keepPlaneShiftAndRickAndMorty)).toEqual([
      "excluded source MM (2014 core book)", undefined, undefined, "excluded source NRH-TCMC (children's book)", undefined,
    ]);
  });

  test("re-including a name that is neither a group nor an excluded source is an error", () => {
    expect(() => defaultExclusions(["XMM"])).toThrow("not an excluded group or source");
  });
});
