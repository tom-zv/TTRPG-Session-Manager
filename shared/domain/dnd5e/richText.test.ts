import { describe, expect, test } from "vitest";
import { parseRichTextBlocks } from "./richText.js";

const tableOf = (text: string) => {
  const block = parseRichTextBlocks(text).find(b => b.type === "table");
  if (block?.type !== "table") throw new Error("no table");
  return block;
};

describe("rich text table rows", () => {
  test("pipes inside a {@ tag stay in their cell", () => {
    expect(tableOf("| d4 | Effect |\n| 2 | You cast {@spell Light|XPHB} |").rows).toEqual([["2", "You cast {@spell Light|XPHB}"]]);
  });

  test("a bare unclosed { is text and does not merge the cells after it", () => {
    const table = tableOf("| d4 | Effect | Duration |\n| 1 | The blade glows {s | 1 hour |");
    expect(table.rows).toEqual([["1", "The blade glows {s", "1 hour"]]);
  });

  test("a bare { before a real tag does not break the tag's cell", () => {
    expect(tableOf("| a | b | c |\n| {s | x {@item Rope|XPHB} | y |").rows).toEqual([["{s", "x {@item Rope|XPHB}", "y"]]);
  });

  test("an incomplete {@ run does not merge the cells after it", () => {
    expect(tableOf("| a | b | c |\n| 1 | {@s fire | 3 |").rows).toEqual([["1", "{@s fire", "3"]]);
  });

  test("an incomplete {@ run does not break a later complete tag's cell", () => {
    expect(tableOf("| a | b | c |\n| {@i rope | x {@spell Light|XPHB} | end |").rows)
      .toEqual([["{@i rope", "x {@spell Light|XPHB}", "end"]]);
  });
});
