import { COMMON_USAGE, parseForce, runCommand, type CommonOptions, type ImportCommand } from "./5etools/cli.js";
import { entityCommand } from "./5etools/entities.js";
import { itemCommand } from "./5etools/items.js";
import { spellCommand } from "./5etools/spells.js";

// Full import from one 5etools commit: spells, then items, then entities (so --check-spells sees the
// new spells). Stops at the first step that fails.

interface AllOptions extends CommonOptions {
  checkSpells: boolean;
  steps: Array<"spells" | "items" | "entities">;
}

const STEPS = ["spells", "items", "entities"] as const;

const allCommand: ImportCommand<AllOptions> = {
  usage: `
Usage:
  npm run import:5etools -- [options]

Imports spells, items and entities (monsters) from one 5etools commit, downloading what the local
mirror lacks. Each step also runs alone: import:5etools:spells, :items, :entities.

Steps:
  --only <steps>           Comma-separated subset of ${STEPS.join(", ")}.
  --check-spells           After entities, list spell references that match no spell.
  --force                  Also overwrite spells and items edited in the app.
${COMMON_USAGE}
`,
  defaults: () => ({ checkSpells: false, steps: [...STEPS] }),
  parseArg(args, index, options) {
    switch (args[index]) {
      case "--check-spells": options.checkSpells = true; return index;
      case "--only": {
        const steps = (args[index + 1] ?? "").split(",").map(step => step.trim());
        const unknown = steps.filter(step => !(STEPS as readonly string[]).includes(step));
        if (!args[index + 1] || unknown.length) throw new Error(`--only expects ${STEPS.join(", ")}.`);
        options.steps = STEPS.filter(step => steps.includes(step));
        return index + 1;
      }
      default: return parseForce(args, index, options);
    }
  },
  async run(options, context) {
    for (const step of options.steps) {
      console.log(`\n== ${step} ==`);
      const ok = step === "spells" ? await spellCommand.run({ ...options }, context)
        : step === "items" ? await itemCommand.run({ ...options }, context)
          : await entityCommand.run({ ...options }, context);
      if (!ok) {
        console.error(`The ${step} step failed; later steps were not run.`);
        return false;
      }
    }
    return true;
  },
};

await runCommand(allCommand);
