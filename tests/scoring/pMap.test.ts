import { pMap } from '../../src/scoring/pMap';

describe('pMap', () => {
  it('preserves input order in results', async () => {
    const items = [10, 20, 30, 40, 50];
    const result = await pMap(items, async (n) => n * 2, 2);
    expect(result).toEqual([20, 40, 60, 80, 100]);
  });

  it('respects the concurrency bound', async () => {
    let inflight = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await pMap(
      items,
      async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
      },
      3,
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(0);
  });

  it('propagates the first rejection and stops starting new work', async () => {
    const started: number[] = [];
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    await expect(
      pMap(
        items,
        async (n) => {
          started.push(n);
          if (n === 1) throw new Error('boom');
          await new Promise((r) => setTimeout(r, 5));
          return n;
        },
        2,
      ),
    ).rejects.toThrow('boom');
    // With concurrency 2, items 0 and 1 start immediately; once 1 throws,
    // no further items should be picked up.
    expect(started.length).toBeLessThan(items.length);
  });

  it('handles concurrency greater than item count', async () => {
    const result = await pMap([1, 2, 3], async (n) => n + 1, 100);
    expect(result).toEqual([2, 3, 4]);
  });
});
