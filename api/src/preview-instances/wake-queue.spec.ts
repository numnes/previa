import { WakeQueue } from './wake-queue';

describe('WakeQueue', () => {
  it('runs jobs one at a time when concurrency is 1', async () => {
    const q = new WakeQueue(1);
    const order: number[] = [];
    let gate = () => {};

    const firstStarted = new Promise<void>((r) => {
      gate = r;
    });

    const p1 = q.enqueue('a', async () => {
      order.push(1);
      await firstStarted;
      order.push(2);
    });
    const p2 = q.enqueue('b', async () => {
      order.push(3);
    });

    await Promise.resolve();
    expect(order).toEqual([1]);

    gate();
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('runs up to concurrency jobs in parallel', async () => {
    const q = new WakeQueue(2);
    let running = 0;
    let maxRunning = 0;
    let releaseBlockers = () => {};
    const blocked = new Promise<void>((r) => {
      releaseBlockers = r;
    });

    const track = async (id: number) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await blocked;
      running--;
    };

    const jobs = [
      q.enqueue('a', () => track(1)),
      q.enqueue('b', () => track(2)),
      q.enqueue('c', () => track(3)),
    ];

    await Promise.resolve();
    expect(maxRunning).toBe(2);
    expect(q.pendingCount).toBe(1);

    releaseBlockers();
    await Promise.all(jobs);
    expect(maxRunning).toBe(2);
  });

  it('deduplicates concurrent enqueue for the same key', async () => {
    const q = new WakeQueue(1);
    let runs = 0;

    const p1 = q.enqueue('same', async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 20));
    });
    const p2 = q.enqueue('same', async () => {
      runs++;
    });

    await Promise.all([p1, p2]);
    expect(runs).toBe(1);
  });
});
