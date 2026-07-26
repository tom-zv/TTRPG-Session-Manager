import { once } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { createServer } from '../../src/app.js';
import encounterEngineManager from '../../src/services/encounters/encounterEngineManager.js';

const servers = new Set<ReturnType<typeof createServer>>();
const sockets = new Set<Socket>();
const defaultTimeout = 3000;

export function waitForEvent(
  socket: Socket,
  event: string,
  timeout = defaultTimeout,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      socket.off('connect_error', onError);
    };
    const onEvent = (...args: unknown[]) => {
      cleanup();
      resolve(args);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for socket event ${event}`));
    }, timeout);
    socket.on(event, onEvent);
    if (event !== 'connect_error') socket.on('connect_error', onError);
  });
}

export function emitWithAck(
  socket: Socket,
  event: string,
  payload: unknown,
  timeout = defaultTimeout,
): Promise<unknown> {
  return socket.timeout(timeout).emitWithAck(event, payload);
}

export async function startSocketServer() {
  const server = createServer();
  servers.add(server);
  const listening = once(server.httpServer, 'listening');
  server.httpServer.listen(0, '127.0.0.1');
  await listening;
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    async connect(namespace: string, token: string): Promise<Socket> {
      const socket = io(`${url}${namespace}`, {
        auth: { token },
        autoConnect: false,
        forceNew: true,
        reconnection: false,
      });
      sockets.add(socket);
      const connected = waitForEvent(socket, 'connect');
      socket.connect();
      try {
        await connected;
        return socket;
      } catch (error) {
        socket.disconnect();
        throw error;
      }
    },
  };
}

export async function closeSocketServers(): Promise<void> {
  for (const socket of sockets) {
    socket.disconnect();
    socket.removeAllListeners();
  }
  sockets.clear();
  try {
    await Promise.all([...servers].map(server => new Promise<void>((resolve, reject) => {
      server.io.close(error => error ? reject(error) : resolve());
    })));
  } finally {
    servers.clear();
    // Disconnect handlers create five-minute timers. Discard after they have run,
    // before the next test resets SQL, so cached encounter IDs cannot leak across tests.
    for (const id of encounterEngineManager.getActiveEncounterIds()) {
      encounterEngineManager.discardEngine(id);
    }
  }
}
