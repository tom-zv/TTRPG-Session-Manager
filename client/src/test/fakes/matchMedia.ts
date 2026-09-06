import { act } from "@testing-library/react";

// jsdom has no matchMedia or layout. This fake evaluates (max-width: Npx) and (min-width: Npx) queries against a
// viewport width the test sets, and (pointer: fine|coarse) against the primary pointer it sets (a mouse unless a
// test asks for touch). It notifies listeners when either change flips a query's result. Other queries never match.

type Listener = (event: MediaQueryListEvent) => void;

export type FakePointer = "fine" | "coarse";

let viewportWidth = 1280;
let primaryPointer: FakePointer = "fine";
const lists = new Set<FakeMediaQueryList>();

const matchesQuery = (query: string, width: number): boolean => {
  const widths = [...query.matchAll(/\((max|min)-width:\s*(\d+(?:\.\d+)?)px\)/g)];
  const pointers = [...query.matchAll(/\(pointer:\s*(fine|coarse|none)\)/g)];
  if (widths.length === 0 && pointers.length === 0) return false;
  return widths.every(([, kind, value]) => (kind === "max" ? width <= Number(value) : width >= Number(value)))
    && pointers.every(([, kind]) => kind === primaryPointer);
};

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media: string;
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;
  private readonly listeners = new Set<Listener>();
  private lastMatches: boolean;

  constructor(query: string) {
    super();
    this.media = query;
    this.lastMatches = matchesQuery(query, viewportWidth);
  }

  get matches() {
    return matchesQuery(this.media, viewportWidth);
  }

  addListener(listener: Listener | null) {
    if (listener) this.listeners.add(listener);
  }

  removeListener(listener: Listener | null) {
    if (listener) this.listeners.delete(listener);
  }

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (type === "change" && typeof listener === "function") this.listeners.add(listener as Listener);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (type === "change" && typeof listener === "function") this.listeners.delete(listener as Listener);
  }

  notifyIfChanged() {
    const matches = this.matches;
    if (matches === this.lastMatches) return;
    this.lastMatches = matches;
    const event = Object.assign(new Event("change"), { matches, media: this.media }) as MediaQueryListEvent;
    this.listeners.forEach(listener => listener(event));
    this.onchange?.call(this, event);
  }
}

/** Install `window.matchMedia` at the given viewport width and primary pointer (a mouse by default). Call in `beforeEach`. */
export function installMatchMedia(width = 1280, { pointer = "fine" }: { pointer?: FakePointer } = {}) {
  viewportWidth = width;
  primaryPointer = pointer;
  lists.clear();
  window.matchMedia = (query: string) => {
    const list = new FakeMediaQueryList(query);
    lists.add(list);
    return list;
  };
}

/** Change the viewport width; queries whose result changes notify their listeners. */
export function setViewportWidth(width: number) {
  act(() => {
    viewportWidth = width;
    lists.forEach(list => list.notifyIfChanged());
  });
}

/** Change the primary pointer (a mouse is "fine", touch is "coarse"); queries whose result changes notify their listeners. */
export function setPrimaryPointer(pointer: FakePointer) {
  act(() => {
    primaryPointer = pointer;
    lists.forEach(list => list.notifyIfChanged());
  });
}

class NoopResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * Layout APIs jsdom lacks and resizable panes or scrolling lists call: `ResizeObserver` (never fires)
 * and `Element.scrollIntoView` (does nothing). Call with `installMatchMedia` for responsive layouts.
 */
export function installLayoutApis() {
  globalThis.ResizeObserver ??= NoopResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
}
