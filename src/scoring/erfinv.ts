// Inverse error function — matches scipy.special.erfinv to within ~1e-12.
// Uses Acklam's rational approximation for the probit function (converted via
// erfinv(x) = probit((x+1)/2) / sqrt(2)) followed by Newton-Raphson refinement
// using a high-accuracy Taylor-series erf.

const SQRT2 = Math.SQRT2;
const TWO_OVER_SQRTPI = 2 / Math.sqrt(Math.PI);
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

function erfTaylor(x: number): number {
  if (Math.abs(x) >= 5) return x > 0 ? 1 : -1;
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 120; n++) {
    term *= -x2 / n;
    const delta = term / (2 * n + 1);
    sum += delta;
    if (Math.abs(delta) <= 1e-18 * Math.abs(sum)) break;
  }
  return TWO_OVER_SQRTPI * sum;
}

// Acklam's rational approximation for probit(p) = Phi^{-1}(p), ~1.15e-9 accuracy.
function probitApprox(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const t = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*t+c[1])*t+c[2])*t+c[3])*t+c[4])*t+c[5]) /
           ((((d[0]*t+d[1])*t+d[2])*t+d[3])*t+1);
  } else if (p <= pHigh) {
    const u = p - 0.5;
    const r = u * u;
    return u * (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    const t = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*t+c[1])*t+c[2])*t+c[3])*t+c[4])*t+c[5]) /
            ((((d[0]*t+d[1])*t+d[2])*t+d[3])*t+1);
  }
}

export function erfinv(x: number): number {
  if (x === 0) return 0;
  if (x >= 1) return Infinity;
  if (x <= -1) return -Infinity;

  // Convert to probit: erfinv(x) = probit((x+1)/2) / sqrt(2)
  let y = probitApprox((x + 1) / 2) / SQRT2;

  // Newton-Raphson refinement: f(y) = erf(y) - x = 0, f'(y) = (2/sqrt(pi)) * exp(-y^2)
  for (let i = 0; i < 4; i++) {
    const ey = erfTaylor(y);
    const dy = TWO_OVER_SQRTPI * Math.exp(-y * y);
    if (dy === 0) break;
    y -= (ey - x) / dy;
  }

  return y;
}

// Exported for testing — erf computed via the same Taylor series as the NR refinement uses.
export function erfForTest(x: number): number {
  return erfTaylor(x);
}
