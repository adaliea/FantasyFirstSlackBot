import { erfinv, erfForTest } from '../../src/scoring/erfinv';

const tol = 1e-9;

function expectClose(a: number, b: number, tolerance = tol): void {
  expect(Math.abs(a - b)).toBeLessThan(tolerance);
}

describe('erfinv', () => {
  test('boundary values', () => {
    expect(erfinv(0)).toBe(0);
    expect(erfinv(1)).toBe(Infinity);
    expect(erfinv(-1)).toBe(-Infinity);
  });

  test('odd function symmetry', () => {
    const vals = [0.1, 0.3, 0.5, 0.7, 0.9, 0.93, 1 / 1.07];
    for (const x of vals) {
      expectClose(erfinv(-x), -erfinv(x));
    }
  });

  test('round-trip: erfinv(erf(y)) ≈ y', () => {
    const ys = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, -1.2, -0.7];
    for (const y of ys) {
      const x = erfForTest(y);
      if (Math.abs(x) >= 1) continue;  // clipped domain
      expectClose(erfinv(x), y);
    }
  });

  test('erfinv(1/1.07) used in qual-point normalisation', () => {
    // This value appears in the Python as erfinv(1/a) where a=1.07.
    // For first-place (rank=1, n teams): x = n/(1.07*n) = 1/1.07 exactly.
    // Verify round-trip: erf(erfinv(1/1.07)) ≈ 1/1.07
    const x = 1 / 1.07;
    const y = erfinv(x);
    expectClose(erfForTest(y), x);
    // Value should be positive (first place → positive score boost)
    expect(y).toBeGreaterThan(1.2);
    expect(y).toBeLessThan(1.5);
  });

  test('known approximate values', () => {
    // erf(0.5) ≈ 0.5205 → erfinv(0.5205) ≈ 0.5
    expectClose(erfinv(erfForTest(0.5)), 0.5);
    // erf(1) ≈ 0.8427
    expectClose(erfinv(erfForTest(1.0)), 1.0);
    // erf(2) ≈ 0.9953
    expectClose(erfinv(erfForTest(2.0)), 2.0);
  });

  test('sampled points across (-1, 1)', () => {
    const points = [-0.99, -0.9, -0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99];
    for (const x of points) {
      const y = erfinv(x);
      expectClose(erfForTest(y), x, 1e-8);  // round-trip to 1e-8
    }
  });
});
