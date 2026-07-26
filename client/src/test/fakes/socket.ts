/**
 * In-memory socket that replaces `getSocket(namespace)`. Install per test file:
 *
 *   vi.mock("src/services/SocketService/socket.js", async () =>
 *     (await import("src/test/fakes/socket.js")).socketModule);
 *
 * `fakeSocket(namespace)` returns the instance the code under test received. Client emits are kept
 * in `emitted`; answer an ack with `ack(event, response)` or `autoAck(event, responder)`.
 */
type Listener = (...args: unknown[]) => void;
type Ack = (...args: unknown[]) => void;

export interface EmittedEvent {
  event: string;
  args: unknown[];
  ack?: Ack;
}

export class FakeSocket {
  connected = false;
  id: string | undefined;
  readonly emitted: EmittedEvent[] = [];
  private listeners = new Map<string, Listener[]>();
  private responders = new Map<string, (...args: unknown[]) => unknown>();

  constructor(readonly namespace: string, connected = true) {
    this.connected = connected;
    this.id = connected ? `fake-${namespace}` : undefined;
  }

  // Socket API used by the client

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  once(event: string, listener: Listener): this {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event?: string, listener?: Listener): this {
    if (event === undefined) this.listeners.clear();
    else if (listener === undefined) this.listeners.delete(event);
    else this.listeners.set(event, (this.listeners.get(event) ?? []).filter(entry => entry !== listener));
    return this;
  }

  removeAllListeners(event?: string): this {
    return this.off(event);
  }

  /** Records the emit. A trailing function argument is the ack. */
  emit(event: string, ...args: unknown[]): this {
    const last = args.at(-1);
    const ack = typeof last === "function" ? (last as Ack) : undefined;
    const payload = ack ? args.slice(0, -1) : args;
    this.emitted.push({ event, args: payload, ack });
    const responder = this.responders.get(event);
    if (responder && ack) ack(responder(...payload));
    return this;
  }

  connect(): this {
    this.serverConnect();
    return this;
  }

  disconnect(): this {
    this.serverDisconnect("io client disconnect");
    return this;
  }

  // Test controls

  /** Delivers a server event to every listener. */
  serverEmit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  serverConnect(): void {
    this.connected = true;
    this.id = `fake-${this.namespace}`;
    this.serverEmit("connect");
  }

  serverDisconnect(reason = "transport close"): void {
    this.connected = false;
    this.id = undefined;
    this.serverEmit("disconnect", reason);
  }

  /** Answers the oldest unanswered emit of `event` that carried an ack. */
  ack(event: string, ...response: unknown[]): void {
    const pending = this.emitted.find(entry => entry.event === event && entry.ack);
    if (!pending?.ack) throw new Error(`No pending ack for "${event}"`);
    const { ack } = pending;
    pending.ack = undefined;
    ack(...response);
  }

  /** Answers every later emit of `event` immediately with `responder(...payload)`. */
  autoAck(event: string, responder: (...args: unknown[]) => unknown): void {
    this.responders.set(event, responder);
  }

  emitsOf(event: string): unknown[][] {
    return this.emitted.filter(entry => entry.event === event).map(entry => entry.args);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

const sockets = new Map<string, FakeSocket>();

export function fakeSocket(namespace = "/"): FakeSocket {
  let socket = sockets.get(namespace);
  if (!socket) {
    socket = new FakeSocket(namespace);
    sockets.set(namespace, socket);
  }
  return socket;
}

export function resetFakeSockets(): void {
  sockets.clear();
}

export const socketModule = {
  getSocket: (namespace = "/") => fakeSocket(namespace),
  disconnectSocket: (namespace?: string) => {
    if (namespace) {
      sockets.get(namespace)?.disconnect();
      sockets.delete(namespace);
    } else {
      sockets.forEach(socket => socket.disconnect());
      sockets.clear();
    }
  },
};
