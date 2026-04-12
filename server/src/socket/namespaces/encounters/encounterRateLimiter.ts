export class EncounterRateLimiter {
  private userCommandTimestamps = new Map<string, number[]>();
  private readonly maxCommandsPerSecond: number;

  constructor(maxCommandsPerSecond = 3) {
    this.maxCommandsPerSecond = maxCommandsPerSecond;
  }

  isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.userCommandTimestamps.get(userId) ?? [];
    const recent = timestamps.filter((ts) => now - ts < 1000);

    if (recent.length >= this.maxCommandsPerSecond) {
      this.userCommandTimestamps.set(userId, recent);
      return true;
    }

    recent.push(now);
    this.userCommandTimestamps.set(userId, recent);
    return false;
  }

  cleanup(userId: string): void {
    this.userCommandTimestamps.delete(userId);
  }
}

const encounterRateLimiter = new EncounterRateLimiter();

export default encounterRateLimiter;
