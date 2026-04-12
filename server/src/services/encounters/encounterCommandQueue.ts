type QueueTask = () => Promise<void>;

export class EncounterCommandQueue {
  private queues = new Map<number, Promise<void>>();

  async enqueue(encounterId: number, task: QueueTask): Promise<void> {
    const previous = this.queues.get(encounterId) ?? Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(task);

    this.queues.set(encounterId, next);

    try {
      await next;
    } finally {
      if (this.queues.get(encounterId) === next) {
        this.queues.delete(encounterId);
      }
    }
  }

  cleanup(encounterId: number): void {
    this.queues.delete(encounterId);
  }
}

const encounterCommandQueue = new EncounterCommandQueue();

export default encounterCommandQueue;
