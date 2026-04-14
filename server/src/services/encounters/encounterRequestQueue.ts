type QueueTask<TResult> = () => Promise<TResult>;

export class EncounterRequestQueue {
  private queues = new Map<number, Promise<void>>();

  async enqueue<TResult>(encounterId: number, task: QueueTask<TResult>): Promise<TResult> {
    const previous = this.queues.get(encounterId) ?? Promise.resolve();

    const nextTask = previous
      .catch(() => undefined)
      .then(task);

    const nextQueue = nextTask.then(() => undefined);

    this.queues.set(encounterId, nextQueue);

    try {
      return await nextTask;
    } finally {
      if (this.queues.get(encounterId) === nextQueue) {
        this.queues.delete(encounterId);
      }
    }
  }

  cleanup(encounterId: number): void {
    this.queues.delete(encounterId);
  }
}

const encounterRequestQueue = new EncounterRequestQueue();

export default encounterRequestQueue;
