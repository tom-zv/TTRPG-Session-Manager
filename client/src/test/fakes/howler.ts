/**
 * In-memory stand-in for Howler's `Howl`. Install per test file:
 *
 *   vi.mock("howler", async () => (await import("src/test/fakes/howler.js")).howlerModule);
 *
 * Every constructed instance is kept in `FakeHowl.instances` (cleared by `resetFakeHowls()`).
 * Tests drive the lifecycle with `fireLoad()`, `fireEnd()`, `fireLoadError()` and `firePlayError()`.
 */
import type { HowlOptions } from "howler";

type Listener = (...args: unknown[]) => void;
type Registration = { event: string; callback: Listener; once: boolean };

export type HowlCall =
  | { method: "play"; id: number }
  | { method: "pause" | "stop" | "unload" }
  | { method: "volume"; volume: number }
  | { method: "fade"; from: number; to: number; duration: number }
  | { method: "seek"; position: number };

export class FakeHowl {
  static instances: FakeHowl[] = [];

  readonly options: HowlOptions;
  readonly calls: HowlCall[] = [];
  private listeners: Registration[] = [];
  private nextId = 1;
  private loadState: "unloaded" | "loading" | "loaded" = "loading";
  private isPlaying = false;
  private currentVolume: number;
  private position = 0;
  private looping: boolean;
  private durationSeconds = 0;

  constructor(options: HowlOptions) {
    this.options = options;
    this.currentVolume = options.volume ?? 1;
    this.looping = options.loop ?? false;
    FakeHowl.instances.push(this);
  }

  get src(): string[] {
    const { src } = this.options;
    return Array.isArray(src) ? src : [src];
  }

  // Howl API

  play(): number {
    const id = this.nextId++;
    this.isPlaying = true;
    this.calls.push({ method: "play", id });
    this.emit("play", id);
    return id;
  }

  pause(): this {
    this.isPlaying = false;
    this.calls.push({ method: "pause" });
    this.emit("pause");
    return this;
  }

  stop(): this {
    this.isPlaying = false;
    this.position = 0;
    this.calls.push({ method: "stop" });
    this.emit("stop");
    return this;
  }

  volume(value?: number): number | this {
    if (value === undefined) return this.currentVolume;
    this.currentVolume = value;
    this.calls.push({ method: "volume", volume: value });
    this.emit("volume");
    return this;
  }

  /** Records the fade and jumps to the target volume; call `fireFade()` to deliver the `fade` event. */
  fade(from: number, to: number, duration: number): this {
    this.currentVolume = to;
    this.calls.push({ method: "fade", from, to, duration });
    return this;
  }

  seek(position?: number): number | this {
    if (position === undefined) return this.position;
    this.position = position;
    this.calls.push({ method: "seek", position });
    this.emit("seek");
    return this;
  }

  loop(value?: boolean): boolean | this {
    if (value === undefined) return this.looping;
    this.looping = value;
    return this;
  }

  playing(): boolean {
    return this.isPlaying;
  }

  duration(): number {
    return this.durationSeconds;
  }

  state(): "unloaded" | "loading" | "loaded" {
    return this.loadState;
  }

  load(): this {
    return this;
  }

  unload(): null {
    this.isPlaying = false;
    this.loadState = "unloaded";
    this.calls.push({ method: "unload" });
    this.listeners = [];
    return null;
  }

  on(event: string, callback: Listener): this {
    this.listeners.push({ event, callback, once: false });
    return this;
  }

  once(event: string, callback: Listener): this {
    this.listeners.push({ event, callback, once: true });
    return this;
  }

  off(event?: string, callback?: Listener): this {
    this.listeners = this.listeners.filter(
      entry => (event !== undefined && entry.event !== event) || (callback !== undefined && entry.callback !== callback)
    );
    return this;
  }

  // Test controls

  fireLoad(durationSeconds = 0): void {
    this.loadState = "loaded";
    this.durationSeconds = durationSeconds;
    this.emit("load");
  }

  fireEnd(): void {
    if (!this.looping) this.isPlaying = false;
    this.emit("end", this.nextId - 1);
  }

  fireFade(): void {
    this.emit("fade", this.nextId - 1);
  }

  fireLoadError(error: unknown = "load failed"): void {
    this.loadState = "unloaded";
    this.emit("loaderror", undefined, error);
  }

  firePlayError(error: unknown = "play failed"): void {
    this.isPlaying = false;
    this.emit("playerror", this.nextId - 1, error);
  }

  private emit(event: string, ...args: unknown[]): void {
    const option = (this.options as unknown as Record<string, unknown>)[`on${event}`];
    if (typeof option === "function") (option as Listener).call(this, ...args);
    for (const entry of [...this.listeners]) {
      if (entry.event !== event) continue;
      if (entry.once) this.listeners = this.listeners.filter(other => other !== entry);
      entry.callback.call(this, ...args);
    }
  }
}

export function resetFakeHowls(): void {
  FakeHowl.instances = [];
}

/** The latest instance whose `src` contains `fragment`. */
export function findHowl(fragment: string): FakeHowl | undefined {
  return [...FakeHowl.instances].reverse().find(howl => howl.src.some(src => src.includes(fragment)));
}

/** Global `Howler` object; only volume and mute are modelled. */
export const FakeHowler = {
  masterVolume: 1,
  muted: false,
  volume(value?: number): number {
    if (value !== undefined) this.masterVolume = value;
    return this.masterVolume;
  },
  mute(muted: boolean): void {
    this.muted = muted;
  },
};

export const howlerModule = { Howl: FakeHowl, Howler: FakeHowler };
