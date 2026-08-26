import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateDnD5eEntityWrite } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { createDefaultEntity, duplicateEntity, type EntityDraft } from "../model/defaults.js";
import { getAddableSections } from "../model/sectionCatalog.js";
import { createEntityDraftState, entityDraftReducer, getEntityDraftWrite } from "./useEntityDraft.js";

describe("entity draft", () => {
  it("writes a loaded stat block back without changing its values", () => {
    const score = fc.integer({ min: 1, max: 30 });
    const modifier = fc.integer({ min: -5, max: 15 });
    const stats = fc.record({
      ac: fc.integer({ min: 0, max: 30 }),
      hp: fc.nat(900),
      cr: fc.constantFrom(null, "", "1/4", "5", "21"),
      creatureType: fc.constantFrom(null, "", "fey"),
      speeds: fc.option(fc.record({ walk: fc.nat(120), fly: fc.nat(120) }), { nil: null }),
      abilityScores: fc.record({ str: score, dex: score, con: score, int: score, wis: score, cha: score }),
      saves: fc.dictionary(fc.constantFrom("str", "dex", "cha"), modifier.map(String)),
      perception: fc.option(modifier, { nil: undefined }),
      manualPassive: fc.boolean(),
      actions: fc.array(fc.record({
        name: fc.constantFrom("Claw", "Pounce"),
        description: fc.constantFrom("Slashing damage.", "Uses {@spell misty step|XPHB}."),
        actionType: fc.constantFrom("action", "bonus action", "reaction", "regional", "special"),
        sortOrder: fc.nat(30),
      })),
      spells: fc.array(fc.record({
        name: fc.constantFrom("Armor of Agathys", "Invisibility"),
        source: fc.constantFrom("PHB", "XPHB"),
        note: fc.constantFrom("self only", "as a 5th-level spell"),
      })),
      displayAs: fc.constantFrom(undefined, "trait", "bonus action", "legendary"),
      hideSpellList: fc.constantFrom(undefined, true, false),
      frequencyGroups: fc.array(fc.record({
        frequency: fc.constantFrom("will", "daily", "recharge"),
        count: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
        each: fc.option(fc.boolean(), { nil: undefined }),
        spells: fc.array(fc.record({
          name: fc.constantFrom("Light", "Fireball"),
          source: fc.constantFrom("XPHB"),
          note: fc.constantFrom("level 5 version"),
        }), { maxLength: 2 }),
      }), { maxLength: 3 }),
      settings: fc.constantFrom({}, { combat: { deathSaves: true } }, { combat: { deathSaves: false } }),
    });

    fc.assert(fc.property(stats, ({
      perception, manualPassive, spells, displayAs, hideSpellList, frequencyGroups, ...values
    }) => {
      const passive = 10 + (perception ?? Math.floor((values.abilityScores.wis - 10) / 2));
      const original: EntityDraft = {
        ...createDefaultEntity(),
        ...values,
        skills: perception === undefined ? {} : { perception: String(perception) },
        passivePerception: manualPassive ? 55 : passive,
        spellcasting: [{
          name: "Pact Magic",
          displayAs,
          descriptions: ["The watcher uses these spells."],
          hideSpellList,
          levels: [{ level: 5, lowerLevel: 1, slots: 2, spells }],
          frequencyGroups,
        }],
      };
      const source = { ...original, templateId: 17, createdAt: "2026-01-01", imported: true, source: "MM" };
      const state = createEntityDraftState({ target: 17, entity: source });

      expect(state.dirty).toBe(false);
      expect(state.modes.passivePerception).toBe(manualPassive ? "manual" : "auto");
      expect(getEntityDraftWrite(state)).toEqual(original);
      expect(validateDnD5eEntityWrite(getEntityDraftWrite(state), "update")).toEqual({
        ok: true,
        value: original,
      });
    }));
  });

  it("infers proficient, expertise and custom bonuses independently for saves and skills", () => {
    const entity = createDefaultEntity();
    const state = createEntityDraftState({
      target: 17,
      entity: {
        ...entity,
        cr: "5",
        abilityScores: { ...entity.abilityScores, dex: 14 },
        saves: { dex: "5", str: "+6", con: "+1", custom: "+3" },
        skills: { stealth: "+8", acrobatics: "+5", perception: "+5 in daylight" },
      },
    });

    expect(state.modes.saves).toEqual({ dex: "proficient", str: "expertise", con: "custom", custom: "custom" });
    expect(state.modes.skills).toEqual({ stealth: "expertise", acrobatics: "proficient", perception: "custom" });
    expect(getEntityDraftWrite(state).passivePerception).toBe(10);
  });

  it("computes an unset passive Perception for the write and preserves a manual zero", () => {
    const entity = { ...createDefaultEntity(), skills: { perception: "+4" }, passivePerception: null };
    const state = createEntityDraftState({ target: 17, entity });
    expect(state.modes.passivePerception).toBe("auto");
    expect(state.draft.passivePerception).toBeNull();
    expect(getEntityDraftWrite(state).passivePerception).toBe(14);

    const manual = createEntityDraftState({ target: 17, entity: { ...entity, passivePerception: 0 } });
    expect(manual.modes.passivePerception).toBe("manual");
    expect(getEntityDraftWrite(manual).passivePerception).toBe(0);
  });

  it("updates derived bonuses after stat changes and restores explicit modes on undo and redo", () => {
    const entity = {
      ...createDefaultEntity(),
      cr: "1/4",
      saves: { wis: "2" },
      skills: { perception: "+4", insight: "+2" },
      passivePerception: 14,
    };
    const initial = createEntityDraftState({ target: 17, entity });
    const custom = entityDraftReducer(initial, {
      type: "commit",
      patch: { skills: entity.skills },
      modes: { skills: { perception: "expertise", insight: "custom" } },
    });
    expect(custom.dirty).toBe(true);

    const edited = entityDraftReducer(custom, {
      type: "commit",
      patch: { cr: "5", abilityScores: { ...entity.abilityScores, wis: 12 } },
    });
    expect(edited.draft.saves).toEqual({ wis: "+4" });
    expect(edited.draft.skills).toEqual({ perception: "+7", insight: "+2" });
    expect(getEntityDraftWrite(edited).passivePerception).toBe(17);

    const undoStats = entityDraftReducer(edited, { type: "undo" });
    expect(undoStats.draft.saves).toEqual({ wis: "2" });
    expect(getEntityDraftWrite(undoStats).passivePerception).toBe(14);
    const undoModes = entityDraftReducer(undoStats, { type: "undo" });
    expect(undoModes.dirty).toBe(false);
    expect(undoModes.modes.skills.insight).toBe("proficient");
    const redoModes = entityDraftReducer(undoModes, { type: "redo" });
    const redoStats = entityDraftReducer(redoModes, { type: "redo" });
    expect(redoStats.dirty).toBe(true);
    expect(redoStats.modes.skills.insight).toBe("custom");
    expect(getEntityDraftWrite(redoStats).passivePerception).toBe(17);
  });

  it("keeps an explicitly custom skill when adding another skill without mode selections", () => {
    const skills = { insight: "+2", perception: "+4" };
    const entity = { ...createDefaultEntity(), cr: "1/4", skills };
    const initial = createEntityDraftState({ target: 17, entity });
    const custom = entityDraftReducer(initial, {
      type: "commit",
      patch: { skills },
      modes: { skills: { insight: "custom", perception: "expertise" } },
    });
    const addedSkill = entityDraftReducer(custom, {
      type: "commit",
      patch: { skills: { ...skills, stealth: "+2" } },
    });
    const changedCr = entityDraftReducer(addedSkill, {
      type: "commit",
      patch: { cr: "5" },
    });

    expect(getEntityDraftWrite(changedCr).skills).toEqual({ insight: "+2", perception: "+6", stealth: "+3" });
    expect(changedCr.modes.skills).toEqual({ insight: "custom", perception: "expertise", stealth: "proficient" });
  });

  it("retains redo through a no-op commit and discards redo after a different edit", () => {
    const entity = { ...createDefaultEntity(), saves: { str: "+2", dex: "+4" } };
    const initial = createEntityDraftState({ target: "new", entity });
    const edited = entityDraftReducer(initial, { type: "commit", patch: { hp: 8 } });
    const undone = entityDraftReducer(edited, { type: "undo" });
    const noOp = entityDraftReducer(undone, { type: "commit", patch: { saves: { dex: "+4", str: "+2" } } });
    expect(noOp.dirty).toBe(false);
    expect(entityDraftReducer(noOp, { type: "redo" }).draft.hp).toBe(8);

    const branched = entityDraftReducer(noOp, { type: "commit", patch: { ac: 14 } });
    expect(entityDraftReducer(branched, { type: "redo" }).draft).toMatchObject({ hp: 1, ac: 14 });
    expect(entityDraftReducer(branched, { type: "commit", patch: { ac: 10 } }).dirty).toBe(false);
  });

  it("requires a destination action for overwrite and keeps the chosen destination across undo", () => {
    const entity = { ...createDefaultEntity(), imported: true };
    const initial = createEntityDraftState({ target: 17, entity });
    expect(initial.mode).toBe("copy");
    const overwrite = entityDraftReducer(initial, { type: "set-mode", mode: "overwrite" });
    expect(overwrite.mode).toBe("overwrite");
    expect(overwrite.dirty).toBe(false);
    const edit = entityDraftReducer(overwrite, { type: "commit", patch: { name: "Watcher" } });
    const copy = entityDraftReducer(edit, { type: "set-mode", mode: "copy" });
    expect(entityDraftReducer(copy, { type: "undo" }).mode).toBe("copy");

    const homebrew = createEntityDraftState({ target: 18, entity: createDefaultEntity() });
    expect(entityDraftReducer(homebrew, { type: "set-mode", mode: "overwrite" }).mode).toBe("update");
    expect(createEntityDraftState({ target: "new", entity }).mode).toBe("update");
  });

  it.each(["creature", "npc", "pc"] as const)("creates a valid %s with the approved default stats", role => {
    const result = validateDnD5eEntityWrite(createDefaultEntity(role));

    expect(result).toMatchObject({
      ok: true,
      value: {
        role, ac: 10, hp: 1, speeds: { walk: 30 }, size: "medium", alignment: "unaligned",
        abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        settings: {}, traits: [], actions: [], spellcasting: [],
      },
    });
  });

  it("duplicates stat content independently of settings, inventory, controllers and provenance", () => {
    const statBlock = {
      ...createDefaultEntity("npc"),
      name: "Watcher",
      traits: [{ name: "Watchful", description: "The watcher stays awake.", sortOrder: 7 }],
    };
    const source = {
      ...statBlock,
      settings: { compendium: { featured: true } },
      templateId: 17,
      createdAt: "2026-01-01",
      controllerUserIds: [2],
      inventory: [{ name: "Torch" }],
      inventoryRevision: 3,
      imported: true,
      source: "MM",
      page: 99,
      locallyEdited: true,
    };
    const copy = duplicateEntity(source);
    const { settings: defaults, ...expected } = statBlock;
    expect(copy).toEqual(expected);
    expect(copy).not.toHaveProperty("settings");
    expect(source.settings).toEqual({ ...defaults, compendium: { featured: true } });

    copy.traits![0].description = "New text.";
    expect(source.traits[0].description).toBe("The watcher stays awake.");
  });

  it("offers missing section kinds in sheet order and always offers a spellcasting or custom entry", () => {
    const options = getAddableSections([{ key: "spellcasting" }, { key: "legendary" }, { key: "special" }]);
    expect(options.map(option => option.key)).toEqual([
      "trait", "spellcasting", "action", "bonus action", "reaction", "mythic", "lair", "regional", "villain", "custom",
    ]);
    expect(options).toContainEqual({ key: "trait", label: "Traits", list: "traits" });
    expect(options).toContainEqual({ key: "spellcasting", label: "Spellcasting", list: "spellcasting" });
    expect(options).toContainEqual({ key: "bonus action", label: "Bonus Actions", list: "actions" });
    expect(options).toContainEqual({ key: "custom", label: "Custom…", list: "actions" });
  });
});
