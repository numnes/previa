export type WakeQueueJob = {
  key: string;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

/**
 * Bounded-concurrency wake queue for idle-sleep resumes.
 * Concurrent requests for the same instance share one in-flight promise.
 */
export class WakeQueue {
  private readonly queue: WakeQueueJob[] = [];
  private activeCount = 0;
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly concurrency = 1) {}

  enqueue(key: string, run: () => Promise<void>): Promise<void> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = new Promise<void>((resolve, reject) => {
      this.queue.push({ key, run, resolve, reject });
      this.pump();
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

  get activeJobs(): number {
    return this.activeCount;
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.activeCount++;
      void this.runJob(job);
    }
  }

  private async runJob(job: WakeQueueJob): Promise<void> {
    try {
      await job.run();
      job.resolve();
    } catch (e) {
      job.reject(e);
    } finally {
      this.activeCount--;
      this.pump();
    }
  }
}
