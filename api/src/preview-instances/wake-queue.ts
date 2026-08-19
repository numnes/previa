export type WakeQueueJob = {
  key: string;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

/**
 * Serial wake queue: one idle-sleep resume at a time per API node.
 * Concurrent requests for the same instance share one in-flight promise.
 */
export class WakeQueue {
  private readonly queue: WakeQueueJob[] = [];
  private processing = false;
  private readonly inflight = new Map<string, Promise<void>>();

  enqueue(key: string, run: () => Promise<void>): Promise<void> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = new Promise<void>((resolve, reject) => {
      this.queue.push({ key, run, resolve, reject });
      void this.drain();
    });

    this.inflight.set(key, promise);
    void promise.finally(() => {
      this.inflight.delete(key);
    });

    return promise;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        try {
          await job.run();
          job.resolve();
        } catch (e) {
          job.reject(e);
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        void this.drain();
      }
    }
  }
}
