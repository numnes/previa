import { WakeQueue } from './wake-queue';

describe('WakeQueue', () => {
  it('runs jobs one at a time', async () => {
    const q = new WakeQueue();
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

  it('deduplicates concurrent enqueue for the same key', async () => {
    const q = new WakeQueue();
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
