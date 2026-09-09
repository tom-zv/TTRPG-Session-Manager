import { describe, expect, test } from "vitest";
import { findReferenceRun, lockReferenceType, referenceTag, replaceReferenceRun } from "./referenceTrigger.js";

/** The run for text with the caret where `|` is. */
const runAt = (marked: string) => {
  const caret = marked.indexOf("|");
  return findReferenceRun(marked.replace("|", ""), caret);
};

describe("the { reference trigger", () => {
  test.each([
    ["right after a typed {", "Glows {|"],
    ["after letters and a query", "Glows {s fire|"],
    ["before later text", "Glows {s fi| near the dead."],
    ["before a complete tag later on the line", "{s fi| then {@spell Light|XPHB}"],
    ["in the second of two runs", "{s a} and {i lo|"],
  ])("the caret is in an unclosed run %s", (_case, marked) => {
    expect(runAt(marked)).not.toBeNull();
  });

  test.each([
    ["with no { before the caret", "Glows near| the dead."],
    ["after a closing }", "{@spell Light}|"],
    ["after a newline", "{s fire\n|"],
    ["with a newline between { and the caret", "{s fi\nre|"],
    ["inside a complete tag", "A {@spell Fi|reball|XPHB} here."],
    ["before the { itself", "Glows |{s"],
  ])("there is no run %s", (_case, marked) => {
    expect(runAt(marked)).toBeNull();
  });

  test("without a collapsed caret there is no run", () => {
    expect(findReferenceRun("Glows {s", null)).toBeNull();
  });

  test.each([
    ["{|", ["spell", "item"]],
    ["{s|", ["spell"]],
    ["{SP|", ["spell"]],
    ["{i|", ["item"]],
    ["{@i|", ["item"]],
    ["{@|", ["spell", "item"]],
    ["{x|", []],
    ["{s1|", []],
  ])("in the type stage %s offers %j", (marked, types) => {
    expect(runAt(marked)).toMatchObject({ stage: "type", types });
  });

  test("a space after a type word locks it, and the rest is the query", () => {
    expect(runAt("Glows {s fire bo|")).toEqual({ start: 6, end: 16, at: false, stage: "search", type: "spell", query: "fire bo" });
    expect(runAt("{@i long|")).toMatchObject({ stage: "search", type: "item", query: "long", at: true });
    expect(runAt("{item |")).toMatchObject({ stage: "search", type: "item", query: "" });
  });

  test("a word that names no type locks nothing and searches nothing", () => {
    expect(runAt("{x fire|")).toMatchObject({ stage: "type", types: [] });
  });

  test.each([
    ["Space or Enter on a typed letter keeps it and adds the space", "Glows {s|", "spell", "Glows {s ", 9],
    ["with only { typed the type's word is written", "{|", "item", "{item ", 6],
    ["with only {@ typed the @ stays", "A {@| B", "spell", "A {@spell  B", 10],
  ])("locking a type: %s", (_case, marked, type, text, caret) => {
    const plain = marked.replace("|", "");
    const run = runAt(marked)!;
    expect(lockReferenceType(plain, run, type as "spell" | "item")).toEqual({ text, caret });
  });

  test("a pick replaces the run from { to the caret, keeps the text after it, and puts the caret after the tag", () => {
    const text = "Glows {s fireb near the dead.";
    const run = findReferenceRun(text, "Glows {s fireb".length)!;
    const tag = referenceTag("spell", "Fireball", "XPHB");
    expect(replaceReferenceRun(text, run, tag)).toEqual({
      text: "Glows {@spell Fireball|XPHB} near the dead.",
      caret: "Glows {@spell Fireball|XPHB}".length,
    });
    expect(referenceTag("spell", "Moonbeam Glow")).toBe("{@spell Moonbeam Glow}");
  });
});
