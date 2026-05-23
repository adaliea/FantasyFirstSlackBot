/**
 * Run `fn(item, index)` over `items` with at most `concurrency` in flight at
 * once. Results are returned in the same order as `items`. If any worker
 * rejects, the returned promise rejects with that error after in-flight work
 * settles (no further items are started).
 */
export async function pMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (concurrency < 1) throw new Error('concurrency must be >= 1');
  const results = new Array<R>(items.length);
  let next = 0;
  let firstError: unknown = null;

  async function worker(): Promise<void> {
    while (true) {
      if (firstError !== null) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (firstError === null) firstError = err;
        return;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (firstError !== null) throw firstError;
  return results;
}
