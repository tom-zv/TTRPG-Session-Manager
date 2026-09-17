import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Traits, actions and spellcasting flow into columns that this module places, not the browser.
 *
 * The sheet body is a multi-column box with `column-fill: auto` and no height, so the browser
 * never breaks it by itself: everything would sit in the first column. Columns start only where a
 * block carries `data-column-break` (`break-before: column`). This module measures the blocks,
 * picks those starts so the tallest column is as short as it can be, and marks them.
 *
 * A block is a section (its heading together with its first entry, so a heading never ends a
 * column) or any later entry of a section. Anything else (the "+ Add section" menu, a status line,
 * an element marked `data-column-keep`) stays with the block before it.
 *
 * While `frozen` (editing), the starts are kept as long as the blocks and the column count are the
 * same: an entry that grows while typed, a field that opens, a card that replaces its block, only
 * lengthen their own column. Only an added, removed or moved block, or a width that changes the
 * column count, places the columns again.
 */

export const COLUMN_BREAK_ATTRIBUTE = "data-column-break";
const KEEP_SELECTOR = "[data-column-keep]";

/** The blocks a column may start at, in flow order. The first one never starts a new column. */
export const collectColumnBlocks = (container: HTMLElement): HTMLElement[] => {
  const blocks: HTMLElement[] = [];
  for (const child of container.children) {
    if (!(child instanceof HTMLElement) || child.tagName !== "SECTION") continue;
    blocks.push(child);
    // The entries under the heading; the first stays with the heading.
    const list = child.lastElementChild;
    if (!(list instanceof HTMLElement) || list === child.firstElementChild) continue;
    for (const entry of [...list.children].slice(1)) {
      if (entry instanceof HTMLElement && !entry.matches(KEEP_SELECTOR)) blocks.push(entry);
    }
  }
  return blocks;
};

/**
 * Splits blocks of these heights, in order, into at most `columns` runs so the tallest run is as
 * short as possible. Returns the index of the block each later run starts at. On a tie the
 * earlier columns take more, as in print.
 */
export const placeColumnBreaks = (heights: readonly number[], columns: number): number[] => {
  const count = heights.length;
  const runs = Math.max(1, Math.min(columns, count));
  if (runs <= 1) return [];
  const prefix = [0];
  for (const height of heights) prefix.push(prefix[prefix.length - 1] + Math.max(0, height));
  const sum = (from: number, to: number) => prefix[to] - prefix[from];
  // best[k][i]: the tallest run when the first i blocks fill k runs; from[k][i]: where the last starts.
  const best: number[][] = [prefix.map((_, i) => (i === 0 ? 0 : Infinity))];
  const from: number[][] = [prefix.map(() => 0)];
  for (let k = 1; k <= runs; k += 1) {
    best[k] = [0];
    from[k] = [0];
    for (let i = 1; i <= count; i += 1) {
      let tallest = Infinity;
      let start = 0;
      // Ties go to the latest start, so the earlier runs take more.
      for (let p = 0; p < i; p += 1) {
        const candidate = Math.max(best[k - 1][p], sum(p, i));
        if (candidate <= tallest) {
          tallest = candidate;
          start = p;
        }
      }
      best[k][i] = tallest;
      from[k][i] = start;
    }
  }
  const starts: number[] = [];
  let end = count;
  for (let k = runs; k > 1; k -= 1) {
    const start = from[k][end];
    if (start > 0) starts.unshift(start);
    end = start;
  }
  return starts;
};

/** How many columns the box draws: its `column-width` and `column-count` as the spec resolves them. */
const columnCount = (container: HTMLElement): number => {
  const style = getComputedStyle(container);
  const width = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const gap = parseFloat(style.columnGap) || 0;
  const most = parseInt(style.columnCount, 10);
  const columnWidth = parseFloat(style.columnWidth);
  const fit = Number.isFinite(columnWidth) && columnWidth > 0 ? Math.max(1, Math.floor((width + gap) / (columnWidth + gap))) : Infinity;
  const count = Math.min(Number.isFinite(most) ? most : Infinity, fit);
  return Number.isFinite(count) ? count : 1;
};

/** Each block's height with no column starts: the box is then one column, so tops are in sequence. */
const measureBlocks = (container: HTMLElement, blocks: readonly HTMLElement[]): number[] => {
  for (const element of container.querySelectorAll(`[${COLUMN_BREAK_ATTRIBUTE}]`)) element.removeAttribute(COLUMN_BREAK_ATTRIBUTE);
  const tops = blocks.map(block => block.getBoundingClientRect().top);
  const box = container.getBoundingClientRect();
  const bottom = box.bottom - parseFloat(getComputedStyle(container).paddingBottom);
  return tops.map((top, index) => (index + 1 < tops.length ? tops[index + 1] : bottom) - top);
};

const markBreaks = (container: HTMLElement, blocks: readonly HTMLElement[], starts: readonly number[]) => {
  const marked = new Set(starts.map(index => blocks[index]).filter(Boolean));
  for (const element of container.querySelectorAll(`[${COLUMN_BREAK_ATTRIBUTE}]`)) {
    if (!marked.has(element as HTMLElement)) element.removeAttribute(COLUMN_BREAK_ATTRIBUTE);
  }
  for (const block of marked) block.setAttribute(COLUMN_BREAK_ATTRIBUTE, "");
};

/** What decides the placement while frozen: the blocks per section and the column count. */
const shapeOf = (container: HTMLElement, blocks: readonly HTMLElement[], columns: number): string =>
  `${columns}|${[...container.children].map(child => (child.tagName === "SECTION" ? blocks.filter(block => child === block || child.contains(block)).length : "-")).join(",")}`;

/** Places the columns of the sheet body in `ref` (see the module comment). */
export const useSheetColumns = (ref: RefObject<HTMLElement | null>, frozen: boolean): void => {
  const placed = useRef<{ shape: string; starts: number[] } | null>(null);
  const frozenRef = useRef(frozen);

  useLayoutEffect(() => {
    // Entering or leaving edit mode places the columns again, once.
    if (frozenRef.current !== frozen) placed.current = null;
    frozenRef.current = frozen;
    const container = ref.current;
    if (!container) return undefined;

    const place = () => {
      const blocks = collectColumnBlocks(container);
      const columns = columnCount(container);
      const shape = shapeOf(container, blocks, columns);
      const last = placed.current;
      if (frozenRef.current && last?.shape === shape) {
        // Same blocks: keep the starts, also on elements that replaced their block (an open card).
        markBreaks(container, blocks, last.starts);
        return;
      }
      const starts = columns > 1 ? placeColumnBreaks(measureBlocks(container, blocks), columns) : [];
      markBreaks(container, blocks, starts);
      placed.current = { shape, starts };
    };

    place();
    // Width (column count) and block heights: before paint, so a change never shows unplaced.
    let width = container.clientWidth;
    const resize = new ResizeObserver(entries => {
      const widthChanged = container.clientWidth !== width;
      width = container.clientWidth;
      if (widthChanged || entries.some(entry => entry.target !== container)) place();
    });
    const observeBlocks = () => {
      resize.disconnect();
      resize.observe(container);
      // While frozen, a block's height changes nothing; only the width can.
      if (!frozenRef.current) for (const block of collectColumnBlocks(container)) resize.observe(block);
    };
    observeBlocks();
    // Added, removed, moved or replaced blocks.
    const mutations = new MutationObserver(() => {
      place();
      observeBlocks();
    });
    mutations.observe(container, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [ref, frozen]);
};
