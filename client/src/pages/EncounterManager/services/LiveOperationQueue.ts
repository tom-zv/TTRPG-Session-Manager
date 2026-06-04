import type { EncounterOperation } from "shared/sockets/encounters/types.js";

/** Receive-only buffer: snapshots and socket operations can arrive in either order. */
export class LiveOperationQueue<TEvent> {
  private pending = new Map<number, EncounterOperation<TEvent>>();
  private timer?: ReturnType<typeof setTimeout>;
  private resyncing = false;
  private disposed = false;

  constructor(private callbacks: {
    getVersion: () => number | undefined;
    isReady: () => boolean;
    apply: (operation: EncounterOperation<TEvent>) => void;
    resync: () => Promise<void>;
    onError: (error: unknown) => void;
  }) {}

  receive(operation: EncounterOperation<TEvent>): void {
    if (this.disposed || operation.version <= (this.callbacks.getVersion() ?? -1)) return;
    if (this.pending.size >= 500) this.pending.clear();
    this.pending.set(operation.version, operation);
    this.flush();
  }

  flush(): void {
    if (this.disposed || !this.callbacks.isReady()) return;
    let version = this.callbacks.getVersion();
    if (version === undefined) return;
    for (const pendingVersion of this.pending.keys()) {
      if (pendingVersion <= version) this.pending.delete(pendingVersion);
    }
    let next = this.pending.get(version + 1);
    while (next) {
      this.callbacks.apply(next);
      this.pending.delete(next.version);
      version = next.version;
      next = this.pending.get(version + 1);
    }
    if (this.pending.size && !this.timer && !this.resyncing) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (!this.pending.size || this.disposed || !this.callbacks.isReady()) return;
        this.resyncing = true;
        void this.callbacks.resync().then(() => this.flush()).catch(this.callbacks.onError).finally(() => {
          this.resyncing = false;
        });
      }, 250);
    }
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.pending.clear();
  }
}
