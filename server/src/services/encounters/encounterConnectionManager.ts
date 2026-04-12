export class EncounterConnectionManager {
  private encounterUsers = new Map<number, Set<string>>();
  private socketToEncounter = new Map<string, number>();

  addUser(encounterId: number, socketId: string): void {
    const existingEncounterId = this.socketToEncounter.get(socketId);
    if (existingEncounterId !== undefined && existingEncounterId !== encounterId) {
      throw new Error(
        `Socket ${socketId} is already tracked for encounter ${existingEncounterId}`
      );
    }

    if (!this.encounterUsers.has(encounterId)) {
      this.encounterUsers.set(encounterId, new Set());
    }
    this.encounterUsers.get(encounterId)!.add(socketId);
    this.socketToEncounter.set(socketId, encounterId);
  }

  removeUser(encounterId: number, socketId: string): boolean {
    const users = this.encounterUsers.get(encounterId);
    if (!users) {
      return false;
    }

    users.delete(socketId);
    if (this.socketToEncounter.get(socketId) === encounterId) {
      this.socketToEncounter.delete(socketId);
    }

    if (users.size === 0) {
      this.encounterUsers.delete(encounterId);
      return true;
    }

    return false;
  }

  removeUserBySocketId(socketId: string): number | null {
    const encounterId = this.socketToEncounter.get(socketId);
    if (encounterId === undefined) {
      return null;
    }

    const encounterEmpty = this.removeUser(encounterId, socketId);
    return encounterEmpty ? encounterId : null;
  }

  getUserCount(encounterId: number): number {
    return this.encounterUsers.get(encounterId)?.size ?? 0;
  }

  getEncounterIdBySocketId(socketId: string): number | null {
    return this.socketToEncounter.get(socketId) ?? null;
  }
}

const encounterConnectionManager = new EncounterConnectionManager();

export default encounterConnectionManager;
