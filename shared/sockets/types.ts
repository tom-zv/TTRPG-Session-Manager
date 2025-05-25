export interface SocketEvent<T extends string, P> {
  type: T;
  payload: P;
}
