// Text format for spell, item and monster descriptions.
//
// Inline: plain text plus references, {@spell Name}, {@spell Name|SRC} or {@spell Name|SRC|display text},
// and {@item ...} in the same form. Other {@tag}s read as their display text.
// Blocks (spell descriptions): blocks are separated by a blank line.
//   **Lead-in.** Rest of the paragraph.
//   - list item            (every line of the block starts with "- ")
//   | header | header |    (every line starts with "|"; the first row is the header,
//   | cell   | cell   |     an optional caption line may come before it)

/** A reference to a catalog record by name, optionally qualified by its source; display replaces the name. */
interface Reference {
  name: string;
  source?: string;
  display?: string;
}

export type InlineToken =
  | { type: "text"; text: string }
  | ({ type: "spell" } & Reference)
  | ({ type: "item" } & Reference);

export type ReferenceToken = Exclude<InlineToken, { type: "text" }>;

export interface RichTextLine {
  lead?: string;              // bold lead-in without the "**" markers, e.g. "Cantrip Upgrade."
  text: string;               // inline text
}

export type RichTextBlock =
  | ({ type: "paragraph" } & RichTextLine)
  | { type: "list"; items: RichTextLine[] }
  | { type: "table"; caption?: string; header: string[]; rows: string[][] };

// Tags the renderer turns into components. Others render as their display text.
const KEPT_TAGS = new Set<ReferenceToken["type"]>(["spell", "item"]);
const isKeptTag = (tag: string): tag is ReferenceToken["type"] => KEPT_TAGS.has(tag as ReferenceToken["type"]);
const TAG_PATTERN = /\{@(\w+)(?: ([^{}]*))?\}/g;

export function parseInlineTags(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const previous = tokens.at(-1);
    if (previous?.type === "text") previous.text += value;
    else tokens.push({ type: "text", text: value });
  };

  for (const match of text.matchAll(TAG_PATTERN)) {
    pushText(text.slice(last, match.index));
    last = match.index + match[0].length;

    const tag = match[1].toLowerCase();
    const [first = "", second = "", third = ""] = (match[2] ?? "").split("|").map(part => part.trim());
    if (isKeptTag(tag) && first) {
      tokens.push({
        type: tag,
        name: first,
        ...(second ? { source: second } : {}),
        ...(third && third !== first ? { display: third } : {}),
      });
    } else {
      pushText(third || first);
    }
  }
  pushText(text.slice(last));
  return tokens;
}

export const inlineTokenText = (token: InlineToken): string =>
  token.type === "text" ? token.text : token.display ?? token.name;

// Plain text for search or any display that cannot render links.
export const stripInlineTags = (text: string): string => parseInlineTags(text).map(inlineTokenText).join("");

export function parseRichTextBlocks(text: string): RichTextBlock[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map(block => block.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
    .filter(lines => lines.length > 0)
    .map(parseBlock);
}

function parseBlock(lines: string[]): RichTextBlock {
  if (lines.every(line => line.startsWith("- "))) {
    return { type: "list", items: lines.map(line => parseLine(line.slice(2))) };
  }

  const tableStart = lines[0].startsWith("|") ? 0 : 1;
  const tableLines = lines.slice(tableStart);
  if (tableLines.length > 0 && tableLines.every(line => line.startsWith("|"))) {
    const [header, ...rows] = tableLines.map(splitTableRow);
    return {
      type: "table",
      ...(tableStart === 1 ? { caption: lines[0] } : {}),
      header,
      rows,
    };
  }

  return { type: "paragraph", ...parseLine(lines.join(" ")) };
}

function parseLine(line: string): RichTextLine {
  const match = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  return match ? { lead: match[1], text: match[2] } : { text: line };
}

// "| a | {@spell X|XPHB} |" -> ["a", "{@spell X|XPHB}"]; pipes inside {...} belong to the tag.
export function splitTableRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of body) {
    if (char === "{") depth += 1;
    if (char === "}") depth = Math.max(0, depth - 1);
    if (char === "|" && depth === 0) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export const formatTableRow = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
