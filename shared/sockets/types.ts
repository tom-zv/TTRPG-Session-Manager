export interface SocketEvent<T extends string, P> {
  type: T;
  payload: P;
}

export type SocketAck =
| { success: true}
| { success: false; error: string;};