// EM-1D antenna synthesis engine — pure, DOM-free physics core + 7 models.
// All formula bodies ported from the verified reference scripts and the
// corrected spec §5–§10. Units: lengths mm, frequency GHz, angles rad.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const C_MM_PER_NS = 299.792458;            // speed of light, mm/ns
export const ETA0 = 376.730313;                   // free-space impedance, Ω
export const EPS0 = 8.8541878128e-12;             // F/m
export const MU0 = 4 * Math.PI * 1e-7;            // H/m
export const SIGMA_CU = 5.8e7;                     // S/m (copper)
export const GAMMA = 0.5772156649015329;          // Euler–Mascheroni
export const CHI11 = 1.841183;                     // first zero of J1'

const C_MM_PER_S = C_MM_PER_NS * 1e9;             // 2.99792458e11 mm/s
const C_M_PER_S = C_MM_PER_NS * 1e6;              // 2.99792458e8  m/s

// ---------------------------------------------------------------------------
// Numerical core
// ---------------------------------------------------------------------------
function factorial(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
function harmonic(k) { let h = 0; for (let i = 1; i <= k; i++) h += 1 / i; return h; }

// Bessel J via power series (A&S 9.1.10): Jn(x)=Σ(-1)^m/(m!(n+m)!)(x/2)^(2m+n)
function besselJ(n, x) {
  const h = x / 2;
  let sum = 0;
  for (let m = 0; m < 60; m++) {
    const term = (((m % 2 === 0) ? 1 : -1) / (factorial(m) * factorial(n + m)))
      * Math.pow(h, 2 * m + n);
    sum += term;
    if (Math.abs(term) < 1e-18 * (Math.abs(sum) + 1e-30) && m > n + 2) break;
  }
  return sum;
}
export const besselJ0 = (x) => besselJ(0, x);
export const besselJ1 = (x) => besselJ(1, x);
export const besselJ2 = (x) => (Math.abs(x) < 1e-12) ? 0 : (2 / x) * besselJ1(x) - besselJ0(x);

// Neumann Y0, Y1 via series (A&S 9.1.13/9.1.11) with Euler γ + harmonic numbers
export function neumannY0(x) {
  const h = x / 2;
  let sum = 0;
  for (let k = 1; k < 60; k++) {
    const term = (((k % 2 === 0) ? 1 : -1) / (factorial(k) ** 2))
      * Math.pow(h, 2 * k) * harmonic(k);
    sum += term;
    if (Math.abs(term) < 1e-18 && k > 3) break;
  }
  return (2 / Math.PI) * ((Math.log(h) + GAMMA) * besselJ0(x) - sum);
}
export function neumannY1(x) {
  const h = x / 2;
  let sum = 0;
  for (let k = 0; k < 60; k++) {
    const term = (((k % 2 === 0) ? 1 : -1) / (factorial(k) * factorial(k + 1)))
      * Math.pow(h, 2 * k + 1) * (harmonic(k) + harmonic(k + 1));
    sum += term;
    if (Math.abs(term) < 1e-18 && k > 3) break;
  }
  return (2 / Math.PI) * ((Math.log(h) + GAMMA) * besselJ1(x) - 1 / x - 0.5 * sum);
}

// Sine/Cosine integrals — A&S 5.2 dual-region.
function siTaylor(x) {
  let sum = 0;
  for (let n = 0; n < 80; n++) {
    const term = (((n % 2 === 0) ? 1 : -1) * Math.pow(x, 2 * n + 1))
      / ((2 * n + 1) * factorial(2 * n + 1));
    sum += term;
    if (Math.abs(term) < 1e-18) break;
  }
  return sum;
}
function ciTaylor(x) {
  let sum = 0;
  for (let n = 1; n < 80; n++) {
    const term = (((n % 2 === 0) ? 1 : -1) * Math.pow(x, 2 * n))
      / (2 * n * factorial(2 * n));
    sum += term;
    if (Math.abs(term) < 1e-18) break;
  }
  return GAMMA + Math.log(x) + sum;
}
function auxF(x) {
  const x2 = x * x;
  const num = x2 * x2 * x2 * x2 + 38.027264 * x2 * x2 * x2 + 265.187033 * x2 * x2 + 335.677320 * x2 + 38.102495;
  const den = x2 * x2 * x2 * x2 + 40.021433 * x2 * x2 * x2 + 322.624911 * x2 * x2 + 570.236280 * x2 + 157.105423;
  return (1 / x) * (num / den);
}
function auxG(x) {
  const x2 = x * x;
  const num = x2 * x2 * x2 * x2 + 42.242855 * x2 * x2 * x2 + 302.757865 * x2 * x2 + 352.018498 * x2 + 21.821899;
  const den = x2 * x2 * x2 * x2 + 48.196927 * x2 * x2 * x2 + 482.485984 * x2 * x2 + 1114.978885 * x2 + 449.690326;
  return (1 / x2) * (num / den);
}
export function Si(x) {
  if (x < 0) return -Si(-x);
  if (x === 0) return 0;
  if (x < 1.5) return siTaylor(x);
  return Math.PI / 2 - auxF(x) * Math.cos(x) - auxG(x) * Math.sin(x);
}
export function Ci(x) {
  if (x <= 0) return NaN;
  if (x < 1.5) return ciTaylor(x);
  return auxF(x) * Math.sin(x) - auxG(x) * Math.cos(x);
}
export const Cin = (x) => GAMMA + Math.log(x) - Ci(x);

// Composite Simpson (n forced even)
export function simpson(f, a, b, n = 100) {
  if (n % 2) n++;
  const dx = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * dx);
  return s * dx / 3;
}

// Sign-change root finder (assumes f(lo), f(hi) bracket a root)
export function bisection(f, lo, hi, tol = 1e-10, maxit = 100) {
  let flo = f(lo);
  for (let i = 0; i < maxit; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; }
    if ((hi - lo) < tol) break;
  }
  return (lo + hi) / 2;
}

// Newton–Raphson root finder
export function newton(f, df, x0, tol = 1e-10, maxit = 50) {
  let x = x0;
  for (let i = 0; i < maxit; i++) {
    const d = df(x);
    if (!Number.isFinite(d) || d === 0) break;
    const nx = x - f(x) / d;
    if (Math.abs(nx - x) < tol) { x = nx; break; }
    x = nx;
  }
  return x;
}

// Scan [lo,hi] for the first sign change of fn, then bisect for the root.
function scanForFirstRoot(fn, lo, hi, step) {
  let prev = fn(lo);
  for (let x = lo + step; x <= hi; x += step) {
    const cur = fn(x);
    if (prev * cur < 0) return bisection(fn, x - step, x, 1e-12, 200);
    prev = cur;
  }
  return null;
}

// J1' and Y1' derivatives (used by disk/annular)
const J1p = (x) => (x === 0 ? 0 : besselJ0(x) - besselJ1(x) / x);
const Y1p = (x) => neumannY0(x) - neumannY1(x) / x;

// ---------------------------------------------------------------------------
// Helpers shared across models
// ---------------------------------------------------------------------------
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ---------------------------------------------------------------------------
// 6.2/6.3 Dipole impedance (induced-EMF, referred to input) — reused by monopole
// L_mm, a_mm, lambda0_mm → { R, X, Rm, Xm }
// ---------------------------------------------------------------------------
export function dipoleImpedance(L, a, lambda0) {
  const k0 = 2 * Math.PI / lambda0;
  const kl = k0 * L, k2l = 2 * k0 * L;
  const Rm = (ETA0 / (4 * Math.PI)) * (
    2 * Cin(kl)
    + Math.cos(kl) * (2 * Cin(kl) - Cin(k2l))
    + Math.sin(kl) * (Si(k2l) - 2 * Si(kl))
  );
  const arg3 = 2 * k0 * a * a / L;
  const Xm = (ETA0 / (4 * Math.PI)) * (
    2 * Si(kl)
    + Math.cos(kl) * (2 * Si(kl) - Si(k2l))
    - Math.sin(kl) * (2 * Ci(kl) - Ci(k2l) - Ci(arg3))
  );
  const s = Math.sin(k0 * L / 2);
  const d = s * s;
  return { R: Rm / d, X: Xm / d, Rm, Xm };
}

// ---------------------------------------------------------------------------
// 6.1 Rectangular patch
// ---------------------------------------------------------------------------
export function rectPatch(d) {
  const er = num(d.substrateEr);
  const h_mm = num(d.substrateHeightMm);
  const fGHz = num(d.frequencyGHz);
  const tanD = num(d.lossTangent) || 0.02;
  const t_mm = num(d.conductorThicknessMm) || 0.035;
  const Zin = num(d.portImpedance) || 50;
  const warnings = [];

  const h = h_mm / 1000;          // m
  const f = fGHz * 1e9;           // Hz
  const c = C_M_PER_S;
  const lam0 = c / f;             // m
  const k0 = 2 * Math.PI / lam0;  // 1/m

  const W = (c / (2 * f)) * Math.sqrt(2 / (er + 1));   // m
  const u = W / h;

  const a_u = 1 + (1 / 49) * Math.log((Math.pow(u, 4) + Math.pow(u / 52, 2)) / (Math.pow(u, 4) + 0.432))
    + (1 / 18.7) * Math.log(1 + Math.pow(u / 18.1, 3));
  const b_er = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  const eeff0 = (er + 1) / 2 + (er - 1) / 2 * Math.pow(1 + 12 / u, -a_u * b_er);

  // Kirschning–Jansen dispersion, fn = f_GHz · h_cm = f_GHz · h_mm/10
  function eeffDisp(fn) {
    const P1 = 0.27488 + (0.6315 + 0.525 / Math.pow(1 + 0.0157 * fn, 20)) * u
      - 0.065683 * Math.exp(-8.7513 * u);
    const P2 = 0.33622 * (1 - Math.exp(-0.03442 * er));
    const P3 = 0.0363 * Math.exp(-4.6 * u) * (1 - Math.exp(-Math.pow(fn / 3.87, 4.97)));
    const P4 = 1 + 2.751 * (1 - Math.exp(-Math.pow(er / 15.916, 8)));
    const P = P1 * P2 * Math.pow((0.1844 + P3 * P4) * fn, 1.5763);
    return er - (er - eeff0) / (1 + P);
  }
  const fn = fGHz * (h_mm / 10);
  const eeffF = eeffDisp(fn);

  const dL = (eeff) => 0.412 * h * (eeff + 0.3) * (u + 0.264) / ((eeff - 0.258) * (u + 0.8));
  const deltaL = dL(eeffF);                              // m
  const L = c / (2 * f * Math.sqrt(eeffF)) - 2 * deltaL; // m (corrected KJ dispersion)

  // Balanis radiation integrals via Simpson. The two radiating slots are separated
  // by the physical resonant length L, so the mutual integral I12 is evaluated at L.
  const X = k0 * W / 2;
  const base = (th) => {
    const ct = Math.cos(th), st = Math.sin(th);
    const sinc = Math.abs(ct) < 1e-9 ? X : Math.sin(X * ct) / ct;
    return sinc * sinc * st * st * st;
  };
  const I1 = simpson(base, 0, Math.PI, 1000);
  const I12 = simpson((th) => base(th) * besselJ0(k0 * L * Math.sin(th)), 0, Math.PI, 1000);
  const G1 = I1 / (120 * Math.PI ** 2);
  const G12 = I12 / (120 * Math.PI ** 2);
  const Rin0 = 1 / (2 * (G1 + G12));

  // Inset feed
  let insetY0 = 0;
  if (Zin > Rin0) {
    warnings.push('target impedance exceeds edge resistance; inset cannot match (y0 clamped to 0)');
  } else {
    insetY0 = (L / Math.PI) * Math.acos(Math.sqrt(Zin / Rin0)); // m
    insetY0 = Math.max(0, Math.min(L / 2, insetY0));
  }

  // Q / bandwidth
  const delta_s = 1 / Math.sqrt(Math.PI * f * MU0 * SIGMA_CU); // m
  const Qc = h / delta_s;
  const Qd = 1 / tanD;
  const Qr = (Math.PI * f * er * EPS0 * W * L) / (h * 2 * (G1 + G12));
  const Qt = 1 / (1 / Qr + 1 / Qc + 1 / Qd);
  const S = 2;
  const bandwidthPct = ((S - 1) / (Qt * Math.sqrt(S))) * 100;

  const W_mm = W * 1000, L_mm = L * 1000, y0_mm = insetY0 * 1000;
  const groundL = L_mm + 6 * h_mm;
  const groundW = W_mm + 6 * h_mm;

  const metrics = {
    W: W_mm, eeff0, eeffF, deltaL: deltaL * 1000, L: L_mm,
    G1, G12, Rin0, insetY0: y0_mm, Qt, bandwidthPct, groundL, groundW,
  };

  const geometry = [
    { shape: 'box', material: 'substrate', center: [0, 0, -h_mm / 2], size: { x: groundW, y: groundL, z: h_mm } },
    { shape: 'box', material: 'pec', center: [0, 0, -h_mm - t_mm / 2], size: { x: groundW, y: groundL, z: t_mm } },
    { shape: 'box', material: 'pec', center: [0, 0, t_mm / 2], size: { x: W_mm, y: L_mm, z: t_mm } },
    { shape: 'feed', material: 'feed', p1: [0, -L_mm / 2 + y0_mm, 0], p2: [0, -L_mm / 2 + y0_mm, -h_mm], impedance: Zin },
  ];

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// 6.2 Dipole (induced-EMF, resonance by bisection)
// ---------------------------------------------------------------------------
export function dipole(d) {
  const fGHz = num(d.frequencyGHz);
  const gap = num(d.feedGapMm) || 1;
  const warnings = [];
  let a = num(d.wireRadiusMm);
  if (!(a > 0)) { a = 0.5; warnings.push('wire radius missing/invalid; defaulted to 0.5 mm'); }

  const lambda0 = C_MM_PER_NS / fGHz; // mm
  const Xof = (L) => dipoleImpedance(L, a, lambda0).Xm;
  const Lres = bisection(Xof, 0.40 * lambda0, 0.50 * lambda0, 1e-9, 200);
  const z = dipoleImpedance(Lres, a, lambda0);

  const metrics = {
    lengthMm: Lres,
    armMm: Lres / 2,
    R: z.R,
    X: z.X,
    resonantLengthRatio: Lres / lambda0,
  };

  // Oriented along z (matches the z-axis cylinder builder and the monopole convention).
  let armLen = (Lres - gap) / 2;
  if (!(armLen > 0)) {
    armLen = Lres / 2;
    warnings.push('feed gap ≥ resonant length; arms degenerate (gap ignored for geometry)');
  }
  const geometry = [
    { shape: 'cylinder', material: 'pec', center: [0, 0, gap / 2 + armLen / 2], radius: a, height: armLen, axis: 'z' },
    { shape: 'cylinder', material: 'pec', center: [0, 0, -(gap / 2 + armLen / 2)], radius: a, height: armLen, axis: 'z' },
    { shape: 'feed', material: 'feed', p1: [0, 0, gap / 2], p2: [0, 0, -gap / 2], impedance: num(d.portImpedance) || 50 },
  ];

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// 6.3 Monopole (image theory: half the equivalent dipole)
// ---------------------------------------------------------------------------
export function monopole(d) {
  const fGHz = num(d.frequencyGHz);
  const gap = num(d.feedGapMm) || 1;
  const gL = num(d.groundLengthMm) || 100;
  const gW = num(d.groundWidthMm) || 100;
  const warnings = [];
  let a = num(d.wireRadiusMm);
  if (!(a > 0)) { a = 0.5; warnings.push('wire radius missing/invalid; defaulted to 0.5 mm'); }

  const lambda0 = C_MM_PER_NS / fGHz; // mm
  const Xof = (L) => dipoleImpedance(L, a, lambda0).Xm;
  const Leq = bisection(Xof, 0.40 * lambda0, 0.50 * lambda0, 1e-9, 200); // equivalent dipole length 2h
  const z = dipoleImpedance(Leq, a, lambda0);

  const height = Leq / 2;
  const metrics = { heightMm: height, R: z.R / 2, X: z.X / 2 };

  const t = 0.5; // ground sheet thickness, mm
  const geometry = [
    { shape: 'box', material: 'pec', center: [0, 0, -t / 2], size: { x: gW, y: gL, z: t } },
    { shape: 'cylinder', material: 'pec', center: [0, 0, gap + height / 2], radius: a, height, axis: 'z' },
    { shape: 'feed', material: 'feed', p1: [0, 0, 0], p2: [0, 0, gap], impedance: num(d.portImpedance) || 50 },
  ];

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// 6.4 Circular disk patch
// ---------------------------------------------------------------------------
export function circularDisk(d) {
  const er = num(d.substrateEr);
  const h_mm = num(d.substrateHeightMm);
  const fGHz = num(d.frequencyGHz);
  const tanD = num(d.lossTangent) || 0.02;
  const t_mm = num(d.conductorThicknessMm) || 0.035;
  const Zin = num(d.portImpedance) || 50;
  const warnings = [];

  const K = 87.876;
  const F = K / (fGHz * Math.sqrt(er)); // mm
  const a = F / Math.sqrt(1 + (2 * h_mm / (Math.PI * er * F)) * (Math.log(Math.PI * F / (2 * h_mm)) + 1.7726));
  const ae = a * Math.sqrt(1 + (2 * h_mm / (Math.PI * er * a)) * (Math.log(Math.PI * a / (2 * h_mm)) + 1.7726));
  const frCheck = K / (ae * Math.sqrt(er)); // GHz

  const lam0 = C_MM_PER_S / (fGHz * 1e9); // mm
  const k0 = 2 * Math.PI / lam0;          // 1/mm
  const kae = k0 * ae;
  const integrand = (th) => {
    const z = kae * Math.sin(th);
    if (z === 0) return 0;
    const t1 = J1p(z);
    const t2 = besselJ1(z) / z;
    return (t1 * t1 + Math.cos(th) * Math.cos(th) * t2 * t2) * Math.sin(th);
  };
  const I = simpson(integrand, 0, Math.PI / 2, 2000);
  const Grad = (kae * kae / 120) * I;

  const f_Hz = fGHz * 1e9;
  const delta_s = 1 / Math.sqrt(Math.PI * f_Hz * MU0 * SIGMA_CU); // m
  const h_m = h_mm / 1000, ae_m = ae / 1000;
  const Qc = h_m / delta_s;
  const Qd = 1 / tanD;
  const wr = 2 * Math.PI * f_Hz;
  const C = wr * EPS0 * er * Math.PI * ae_m * ae_m * (1 - 1 / (CHI11 * CHI11)) / (2 * h_m);
  const Gc = C / Qc;
  const Gd = C / Qd;
  const Redge = 1 / (Grad + Gc + Gd);

  // Probe match (Newton): J1(k ρ0) = J1(χ11)·√(Zin/Redge)
  let matchable = true, probeRho0 = 0;
  if (Redge < Zin) {
    matchable = false;
    warnings.push('edge resistance < target; not matchable by inward probe');
  } else {
    const target = besselJ1(CHI11) * Math.sqrt(Zin / Redge);
    const x = newton((xx) => besselJ1(xx) - target, (xx) => J1p(xx), CHI11 / 2, 1e-12, 100);
    const k = CHI11 / ae;
    probeRho0 = x / k;
  }

  const Qt = C * Redge; // = C/(Grad+Gc+Gd)
  const S = 2;
  const bandwidthPct = ((S - 1) / (Qt * Math.sqrt(S))) * 100;
  const groundRadius = a + 4 * h_mm;

  const metrics = {
    a, ae, frCheck, Grad, Gc, Gd, Redge, probeRho0, Qt, bandwidthPct, groundRadius, matchable,
  };

  const span = 2 * groundRadius;
  const geometry = [
    { shape: 'box', material: 'substrate', center: [0, 0, -h_mm / 2], size: { x: span, y: span, z: h_mm } },
    { shape: 'box', material: 'pec', center: [0, 0, -h_mm - t_mm / 2], size: { x: span, y: span, z: t_mm } },
    { shape: 'cylinder', material: 'pec', center: [0, 0, t_mm / 2], radius: a, height: t_mm, axis: 'z' },
    { shape: 'feed', material: 'feed', p1: [probeRho0, 0, 0], p2: [probeRho0, 0, -h_mm], impedance: Zin },
  ];

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// 6.5 Annular ring patch
// ---------------------------------------------------------------------------
export function annularRoot(rho) {
  if (!(rho > 1)) return null;
  const f = (x) => J1p(x) * Y1p(rho * x) - J1p(rho * x) * Y1p(x);
  const hi = Math.min(100, 20 / (rho - 1));
  return scanForFirstRoot(f, 0.05, hi, 0.001);
}

export function annularRing(d) {
  const er = num(d.substrateEr);
  const h_mm = num(d.substrateHeightMm);
  const fGHz = num(d.frequencyGHz);
  const tanD = num(d.lossTangent) || 0.02;
  const t_mm = num(d.conductorThicknessMm) || 0.035;
  const Zin = num(d.portImpedance) || 50;
  const rho_in = num(d.ringRatio) || 2;
  const warnings = [];

  if (!(rho_in > 1)) {
    return { inputs: { ...d }, metrics: {}, warnings: ['ring ratio b/a must be > 1'], geometry: [] };
  }

  const fHz = fGHz * 1e9;
  const c = C_MM_PER_S; // mm/s
  const dFringe = h_mm / Math.sqrt(er);

  let aeff = 0, rhoEff = rho_in;
  for (let it = 0; it < 5; it++) {
    const xr = annularRoot(rhoEff);
    aeff = (xr * c) / (2 * Math.PI * fHz * Math.sqrt(er));
    rhoEff = rho_in + (rho_in + 1) * dFringe / aeff;
  }
  const a = aeff + dFringe;
  const b = rho_in * a;
  const x0 = annularRoot(rho_in);

  // Q / bandwidth (cavity-loss estimate)
  const delta_s = 1 / Math.sqrt(Math.PI * fHz * MU0 * SIGMA_CU);
  const Qc = (h_mm / 1000) / delta_s;
  const Qd = 1 / tanD;
  const Qt = 1 / (1 / Qc + 1 / Qd);
  const S = 2;
  const bandwidthPct = ((S - 1) / (Qt * Math.sqrt(S))) * 100;

  const rf = (a + b) / 2;
  const metrics = { a, b, x0, aeff, rf, Qt, bandwidthPct };

  const span = 2 * b + 6 * h_mm;
  const geometry = [
    { shape: 'box', material: 'substrate', center: [0, 0, -h_mm / 2], size: { x: span, y: span, z: h_mm } },
    { shape: 'box', material: 'pec', center: [0, 0, -h_mm - t_mm / 2], size: { x: span, y: span, z: t_mm } },
    { shape: 'ring', material: 'pec', center: [0, 0, t_mm / 2], rInner: a, rOuter: b, height: t_mm, axis: 'z' },
    { shape: 'feed', material: 'feed', p1: [rf, 0, 0], p2: [rf, 0, -h_mm], impedance: Zin },
  ];

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// 6.6 CP circular patch (perturbation of the disk)
// ---------------------------------------------------------------------------
export function cpCircular(d) {
  const Zin = num(d.portImpedance) || 50;
  const polarization = (d.polarization === 'LHCP') ? 'LHCP' : 'RHCP';
  const warnings = [];

  const disk = circularDisk(d);
  warnings.push(...disk.warnings); // includes the not-matchable message when applicable
  const a = disk.metrics.a;
  const Q = disk.metrics.Qt;
  const f0 = num(d.frequencyGHz);

  const deltaSratio = 1 / (2 * Q);
  const truncationDepth = a * Math.pow(3 * Math.PI / (16 * Math.SQRT2 * Q), 2 / 3);
  const alpha = 0.1;
  const slotLength = a * Math.sqrt(Math.PI / (2 * alpha * Q));
  const slotWidth = alpha * slotLength;
  const f1 = f0 * (1 - 1 / (2 * Q));
  const f2 = f0 * (1 + 1 / (2 * Q));
  const arBandwidthPct = (0.348 / Q) * 100;
  const feedRho0 = 0.35 * a;
  const feedAngleDeg = (polarization === 'LHCP') ? -45 : 45;

  const metrics = {
    a, Qt: Q, deltaSratio, truncationDepth, slotLength, slotWidth,
    f1, f2, arBandwidthPct, feedRho0, feedAngleDeg, f0,
  };

  const t_mm = num(d.conductorThicknessMm) || 0.035;
  const h_mm = num(d.substrateHeightMm);
  const ang = feedAngleDeg * Math.PI / 180;
  const px = feedRho0 * Math.cos(ang), py = feedRho0 * Math.sin(ang);

  // Reuse the disk substrate/ground; replace the disk patch with a CP segment.
  const geometry = [
    disk.geometry[0],
    disk.geometry[1],
    {
      // Single-feed CP uses ONE perturbation mechanism: two opposite truncations
      // (total ΔS = S/(2Q)). The slot (slotLength/slotWidth in metrics) is the
      // alternative; emitting both would double-perturb, so geometry uses cuts only.
      shape: 'segment', material: 'pec', center: [0, 0, t_mm / 2], radius: a, height: t_mm, axis: 'z',
      cuts: [{ angleDeg: 45, depth: truncationDepth }, { angleDeg: 225, depth: truncationDepth }],
    },
    { shape: 'feed', material: 'feed', p1: [px, py, 0], p2: [px, py, -h_mm], impedance: Zin },
  ];

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// 6.7 UWB planar circular disc monopole (Liang)
// ---------------------------------------------------------------------------
export function discMonopoleUWB(d) {
  const fL = num(d.lowerCutoffGHz);
  const g_mm = num(d.feedGapMm) || 0.3;
  const gLin = num(d.groundLengthMm);
  const gWin = num(d.groundWidthMm);
  const warnings = [];

  const K = 7.2;
  const g_cm = g_mm / 10;
  const r_cm = ((K / fL) - g_cm) / 3;
  const r_mm = r_cm * 10;
  const reqRadius = r_mm / 2;
  const groundW = Math.max(gWin, 4 * r_mm);
  const groundL = Math.max(gLin, 3 * r_mm);
  const fLcheck = K / (3 * r_cm + g_cm);

  const metrics = { discRadius: r_mm, reqRadius, groundW, groundL, fLcheck };

  if (r_mm <= 0) {
    warnings.push('lower cutoff too high for the given feed gap (disc radius would be ≤ 0)');
    return { inputs: { ...d }, metrics, warnings, geometry: [] };
  }

  // Planar layout in the x-y plane: ground in −y, disc in +y, fed across the gap.
  // Ground top edge sits at y=0 (feed P1); disc bottom at y=g; clean gap = g.
  const t_mm = 0.035;
  const geometry = [
    { shape: 'box', material: 'pec', center: [0, -(groundL / 2), -t_mm / 2], size: { x: groundW, y: groundL, z: t_mm } },
    { shape: 'cylinder', material: 'pec', center: [0, g_mm + r_mm, 0], radius: r_mm, height: t_mm, axis: 'z' },
    { shape: 'feed', material: 'feed', p1: [0, 0, 0], p2: [0, g_mm, 0], impedance: num(d.portImpedance) || 50 },
  ];

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// 6.8 Serpentine (meander) loop — resonant 1λ loop, FR-4 ± ground
// Curve (unit R, a=A/R, s=S/R):
//   x̂=(1+a·sin nt)·cos t + s·sin 2nt·sin t ; ŷ=(1+a·sin nt)·sin t − s·sin 2nt·cos t
// ---------------------------------------------------------------------------
function serpSpeed(t, n, a, s) {
  const u = 1 + a * Math.sin(n * t);
  const up = a * n * Math.cos(n * t);
  const s2 = Math.sin(2 * n * t), c2 = Math.cos(2 * n * t);
  const ct = Math.cos(t), st = Math.sin(t);
  const xp = up * ct - u * st + s * (2 * n * c2 * st + s2 * ct);
  const yp = up * st + u * ct - s * (2 * n * c2 * ct - s2 * st);
  return Math.hypot(xp, yp);
}

// Unit-curve length G = ∮₀^{2π} |r'| dt (dense composite Simpson).
export function serpShapeFactor(n, a, s) {
  let N = Math.max(4000, 120 * Math.round(n)); if (N % 2) N++;
  const dx = (2 * Math.PI) / N;
  let sum = serpSpeed(0, n, a, s) + serpSpeed(2 * Math.PI, n, a, s);
  for (let i = 1; i < N; i++) sum += (i % 2 ? 4 : 2) * serpSpeed(i * dx, n, a, s);
  return sum * dx / 3;
}

function serpPoint(t, R, A, S, n) {
  const u = R + A * Math.sin(n * t);
  const v = S * Math.sin(2 * n * t);
  const ct = Math.cos(t), st = Math.sin(t);
  return [u * ct + v * st, u * st - v * ct];
}

export function serpentineLoop(d) {
  const fGHz = num(d.frequencyGHz);
  const er = num(d.substrateEr) || 1;
  const h = num(d.substrateHeightMm) || 1.6;
  const w = num(d.traceWidthMm) || 1.0;
  const a = num(d.ampRatio);
  const s = num(d.serpRatio);
  const g = num(d.feedGapMm) || 1.0;
  const Zin = num(d.portImpedance) || 50;
  const t = num(d.conductorThicknessMm) || 0.035;
  const grounded = (d.groundPlane || 'Full') === 'Full';
  const warnings = [];

  let n = Math.round(num(d.undulations));
  if (!(n >= 4)) { n = 4; warnings.push('undulations n coerced to a minimum of 4'); }

  // effective permittivity: microstrip (grounded) vs interface strip (ungrounded)
  const eeff = grounded
    ? (er + 1) / 2 + (er - 1) / 2 * Math.pow(1 + 12 * h / w, -0.5)
    : (er > 1 ? (er + 1) / 2 : 1);
  const lam0 = C_MM_PER_NS / fGHz;
  const lamg = lam0 / Math.sqrt(eeff);

  const G = serpShapeFactor(n, a, s);
  const R = lamg / G;                     // 1λ loop: R·G = λg
  const A = a * R, S = s * R;
  const outerR = R + A;
  const footprintD = 2 * outerR + w;
  const meander = G / (2 * Math.PI);
  const plainLoopD = lamg / Math.PI;
  const miniaturize = plainLoopD / footprintD;
  const Rrad = grounded ? null : 100;

  if (grounded) warnings.push('full ground ~h behind the loop suppresses radiation; grounded loop behaves as a resonator, not an efficient 1λ radiator');

  // centerline, broken at t=0 for the feed gap
  const s0 = serpSpeed(0, n, a, s) * R;
  const dGap = Math.min(0.6, g / Math.max(s0, 1e-6));
  if (dGap >= Math.PI / n) warnings.push('feed gap large relative to undulation spacing');
  const t0 = dGap / 2, t1 = 2 * Math.PI - dGap / 2;
  const M = Math.max(720, 16 * n);
  const spine = [];
  for (let i = 0; i <= M; i++) spine.push(serpPoint(t0 + (t1 - t0) * i / M, R, A, S, n));

  // offset ±w/2 → closed ribbon polygon (the gap makes it a simple strip, no hole)
  const left = [], right = [];
  for (let i = 0; i <= M; i++) {
    const p = spine[i];
    const b = spine[Math.min(M, i + 1)], q = spine[Math.max(0, i - 1)];
    let tx = b[0] - q[0], ty = b[1] - q[1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const nx = -ty, ny = tx;
    left.push([p[0] + nx * w / 2, p[1] + ny * w / 2]);
    right.push([p[0] - nx * w / 2, p[1] - ny * w / 2]);
  }
  // coarse self-overlap check: non-adjacent centerline points closer than w
  const stepc = Math.max(1, Math.floor((M + 1) / 160));
  const sep = Math.max(1, Math.floor((M + 1) / (2 * n)));   // skip same-strand neighbors (< half an undulation apart)
  let minSep = Infinity;
  for (let i = 0; i <= M; i += stepc)
    for (let j = i + sep; j <= M; j += stepc) {
      const dd = Math.hypot(spine[i][0] - spine[j][0], spine[i][1] - spine[j][1]);
      if (dd < minSep) minSep = dd;
    }
  if (minSep < w) warnings.push('trace may self-overlap — reduce trace width or undulations');

  const outline = left.concat(right.reverse());

  const metrics = { R, A, S, outerR, footprintD, Lpath: R * G, G, meander,
    eeff, lamg, plainLoopD, miniaturize, Rrad, n, grounded, feedGap: g };

  const span = footprintD + 6 * h;
  const tg = t;   // ground copper reuses the conductor thickness
  const geometry = [];
  geometry.push({ shape: 'trace', material: 'pec', outline, center: [0, 0, 0], thickness: t });
  if (er > 1) geometry.push({ shape: 'box', material: 'substrate', center: [0, 0, -h / 2], size: { x: span, y: span, z: h } });
  if (grounded) geometry.push({ shape: 'box', material: 'pec', center: [0, 0, -h - tg / 2], size: { x: span, y: span, z: tg } });
  geometry.push({ shape: 'feed', material: 'feed', p1: [spine[0][0], spine[0][1], 0], p2: [spine[M][0], spine[M][1], 0], impedance: Zin });

  return { inputs: { ...d }, metrics, warnings, geometry };
}

// ---------------------------------------------------------------------------
// Dispatcher + degradation
// ---------------------------------------------------------------------------
export const TYPES = [
  { key: 'rect', label: 'Rectangular Patch' },
  { key: 'dipole', label: 'Dipole' },
  { key: 'monopole', label: 'Monopole' },
  { key: 'disk', label: 'Circular Disk Patch' },
  { key: 'annular', label: 'Annular Ring Patch' },
  { key: 'cp', label: 'CP Circular Patch' },
  { key: 'uwb', label: 'UWB Disc Monopole' },
  { key: 'serp', label: 'Serpentine Loop' },
];

function sanitizeNum(o, ctx) {
  if (typeof o === 'number') { if (!Number.isFinite(o)) { ctx.n++; return 0; } return o; }
  if (Array.isArray(o)) return o.map((v) => sanitizeNum(v, ctx));
  if (o && typeof o === 'object') {
    const r = {};
    for (const k in o) r[k] = sanitizeNum(o[k], ctx);
    return r;
  }
  return o;
}

function sanitizeResult(r) {
  const ctx = { n: 0 };
  r.metrics = sanitizeNum(r.metrics || {}, ctx);
  r.geometry = (r.geometry || []).map((v) => sanitizeNum(v, ctx));
  r.warnings = r.warnings || [];
  if (ctx.n > 0) {
    r.warnings.push('non-finite value(s) sanitized to 0 — inputs may be out of valid domain; geometry may be degenerate');
  }
  return r;
}

const SUBSTRATE_TYPES = new Set(['rect', 'disk', 'annular', 'cp', 'serp']);

export function synthesize(type, design) {
  const fail = (msg) => ({ inputs: { ...design }, metrics: {}, warnings: [msg], geometry: [] });
  const needFreq = (type === 'uwb') ? num(design.lowerCutoffGHz) : num(design.frequencyGHz);
  if (!(needFreq > 0)) return fail('invalid or missing frequency');
  if (SUBSTRATE_TYPES.has(type)) {
    if (!(num(design.substrateEr) >= 1)) return fail('relative permittivity (εr) must be ≥ 1');
    if (!(num(design.substrateHeightMm) > 0)) return fail('substrate height must be > 0');
  }
  try {
    let r;
    switch (type) {
      case 'rect': r = rectPatch(design); break;
      case 'dipole': r = dipole(design); break;
      case 'monopole': r = monopole(design); break;
      case 'disk': r = circularDisk(design); break;
      case 'annular': r = annularRing(design); break;
      case 'cp': r = cpCircular(design); break;
      case 'uwb': r = discMonopoleUWB(design); break;
      case 'serp': r = serpentineLoop(design); break;
      default:
        return { inputs: { ...design }, metrics: {}, warnings: ['unknown antenna type: ' + type], geometry: [] };
    }
    return sanitizeResult(r);
  } catch (e) {
    return { inputs: { ...design }, metrics: {}, warnings: ['synthesis error: ' + e.message], geometry: [] };
  }
}

// ---------------------------------------------------------------------------
// CST VBA generation (geometry-driven)
// ---------------------------------------------------------------------------
const vn = (x) => { const v = Number(x); return Number.isFinite(v) ? String(v) : '0'; };
// CST's built-in perfect conductor is the case-sensitive "PEC"; map the IR's 'pec'.
const mat = (m) => (m === 'pec' ? 'PEC' : m);

function vbaBrick(p, name, comp) {
  const c = p.center, s = p.size;
  const x0 = num(c[0]) - num(s.x) / 2, x1 = num(c[0]) + num(s.x) / 2;
  const y0 = num(c[1]) - num(s.y) / 2, y1 = num(c[1]) + num(s.y) / 2;
  const z0 = num(c[2]) - num(s.z) / 2, z1 = num(c[2]) + num(s.z) / 2;
  return [
    'With Brick',
    '  .Reset',
    `  .Name "${name}"`,
    `  .Component "${comp}"`,
    `  .Material "${mat(p.material)}"`,
    `  .Xrange ${vn(x0)}, ${vn(x1)}`,
    `  .Yrange ${vn(y0)}, ${vn(y1)}`,
    `  .Zrange ${vn(z0)}, ${vn(z1)}`,
    '  .Create',
    'End With',
  ].join('\n');
}

// Axis-aware cylinder: honors the IR axis ('x'|'y'|'z'). For axis A the cylinder
// extends along A (range = center_A ± height/2); the other two coords are centers.
function vbaCylinder(name, comp, material, center, axis, rOuter, rInner, height) {
  const cx = num(center[0]), cy = num(center[1]), cz = num(center[2]);
  const ax = (axis === 'x' || axis === 'y') ? axis : 'z';
  const half = num(height) / 2;
  const lines = [
    'With Cylinder',
    '  .Reset',
    `  .Name "${name}"`,
    `  .Component "${comp}"`,
    `  .Material "${mat(material)}"`,
    `  .OuterRadius ${vn(rOuter)}`,
    `  .InnerRadius ${vn(rInner)}`,
    `  .Axis "${ax}"`,
  ];
  if (ax === 'z') {
    lines.push(`  .Xcenter ${vn(cx)}`, `  .Ycenter ${vn(cy)}`, `  .Zrange ${vn(cz - half)}, ${vn(cz + half)}`);
  } else if (ax === 'y') {
    lines.push(`  .Xcenter ${vn(cx)}`, `  .Zcenter ${vn(cz)}`, `  .Yrange ${vn(cy - half)}, ${vn(cy + half)}`);
  } else {
    lines.push(`  .Ycenter ${vn(cy)}`, `  .Zcenter ${vn(cz)}`, `  .Xrange ${vn(cx - half)}, ${vn(cx + half)}`);
  }
  lines.push('  .Segments 0', '  .Create', 'End With');
  return lines.join('\n');
}

function vbaSubtract(comp, target, tool) {
  return `Solid.Subtract "${comp}:${target}", "${comp}:${tool}"`;
}

// Rotate a named solid about the z-axis (used for CP truncation cuts and slot).
function vbaRotateZ(comp, name, angleDeg) {
  if (!num(angleDeg)) return null;
  return [
    'With Transform',
    '  .Reset',
    `  .Name "${comp}:${name}"`,
    '  .Origin "Free"',
    '  .Center 0, 0, 0',
    `  .Angle 0, 0, ${vn(angleDeg)}`,
    '  .Transform "Shape", "Rotate"',
    'End With',
  ].join('\n');
}

function vbaExtrudePolygon(name, comp, material, outline, z, height) {
  const lines = [
    'With Extrude',
    '  .Reset',
    `  .Name "${name}"`,
    `  .Component "${comp}"`,
    `  .Material "${mat(material)}"`,
    '  .Mode "Pointlist"',
    `  .Height ${vn(height)}`,
    '  .Twist 0.0',
    '  .Taper 0.0',
    `  .Origin 0, 0, ${vn(z)}`,
    '  .Uvector 1, 0, 0',
    '  .Vvector 0, 1, 0',
  ];
  (outline || []).forEach((p, i) => {
    lines.push(`  ${i === 0 ? '.Point' : '.LineTo'} ${vn(p[0])}, ${vn(p[1])}`);
  });
  lines.push('  .Create', 'End With');
  return lines.join('\n');
}

function vbaDiscretePort(p, n) {
  const a = p.p1, b = p.p2;
  return [
    'With DiscretePort',
    '  .Reset',
    `  .PortNumber ${n}`,
    '  .Type "SParameter"',
    `  .Impedance ${vn(p.impedance)}`,
    `  .SetP1 False, ${vn(a[0])}, ${vn(a[1])}, ${vn(a[2])}`,
    `  .SetP2 False, ${vn(b[0])}, ${vn(b[1])}, ${vn(b[2])}`,
    '  .UsePickedPoints False',
    '  .Create',
    'End With',
  ].join('\n');
}

export function buildVba(result, design) {
  const metrics = (result && result.metrics) || {};
  const warnings = (result && result.warnings) || [];
  const geometry = (result && result.geometry) || [];
  const comp = 'component1';
  const isUWB = metrics.discRadius != null;
  const typeLabel = (TYPES.find((t) => t.key === (design && design.type)) || {}).label || (design && design.type) || 'unknown';
  const hasSubstrate = geometry.some((p) => p && p.material === 'substrate');

  // Solver frequency span
  let fLo, fHi;
  if (isUWB) {
    const fL = num(design.lowerCutoffGHz);
    fLo = fL; fHi = 12 * fL;
  } else {
    const f = num(design.frequencyGHz);
    fLo = 0.7 * f; fHi = 1.3 * f;
  }

  const header = ['\' ============================================================',
    '\' EM-1D synthesized antenna — CST Studio Suite VBA macro',
    `\' antenna type: ${typeLabel}`,
    `\' frequency span (GHz): ${vn(fLo)} .. ${vn(fHi)}`];
  if (hasSubstrate) header.push(`\' substrate Er: ${vn(design.substrateEr)}  loss tangent: ${vn(design.lossTangent)}`);
  for (const k in metrics) {
    const v = metrics[k];
    if (typeof v === 'number') header.push(`\' ${k} = ${vn(v)}`);
    else if (typeof v === 'boolean') header.push(`\' ${k} = ${v ? 'true' : 'false'}`);
  }
  for (const w of warnings) header.push(`\' WARNING: ${String(w).replace(/[\r\n]+/g, ' ')}`);
  header.push('\' ============================================================');

  const body = [];
  body.push('Sub Main');
  body.push('');

  // Units / global
  body.push('With Units');
  body.push('  .Geometry "mm"');
  body.push('  .Frequency "GHz"');
  body.push('  .Time "ns"');
  body.push('End With');
  body.push('');

  // Material (substrate) with lossTangent — only when the geometry uses one
  if (hasSubstrate) {
    body.push('With Material');
    body.push('  .Reset');
    body.push('  .Name "substrate"');
    body.push('  .Type "Normal"');
    body.push(`  .Epsilon ${vn(design.substrateEr)}`);
    body.push('  .Mu 1.0');
    body.push(`  .TanD ${vn(design.lossTangent)}`);
    body.push('  .TanDModel "ConstTanD"');
    body.push('  .Create');
    body.push('End With');
    body.push('');
  }

  let portN = 0;
  geometry.forEach((p, i) => {
    if (!p || !p.shape) return;
    if (p.shape === 'box') {
      body.push(vbaBrick(p, `box_${i}`, comp));
    } else if (p.shape === 'cylinder') {
      body.push(vbaCylinder(`cyl_${i}`, comp, p.material, p.center, p.axis || 'z', p.radius, 0, p.height));
    } else if (p.shape === 'ring') {
      // outer cylinder minus inner cylinder (Boolean subtract)
      body.push(vbaCylinder(`ring_${i}_outer`, comp, p.material, p.center, 'z', p.rOuter, 0, p.height));
      body.push(vbaCylinder(`ring_${i}_inner`, comp, p.material, p.center, 'z', p.rInner, 0, p.height));
      body.push(vbaSubtract(comp, `ring_${i}_outer`, `ring_${i}_inner`));
    } else if (p.shape === 'segment') {
      // base disk + Boolean truncation cuts (+ optional slot), each a small rotated brick
      const cz = num(p.center[2]);
      const R = num(p.radius), hh = num(p.height) * 2;
      body.push(vbaCylinder(`seg_${i}`, comp, p.material, p.center, 'z', R, 0, p.height));
      (p.cuts || []).forEach((cut, j) => {
        const depth = num(cut.depth);
        if (depth <= 0) return;
        // chord width of a segment of depth `depth` on radius R: 2*sqrt(2R·depth − depth²)
        const chordW = 2 * Math.sqrt(Math.max(0, 2 * R * depth - depth * depth));
        // thin radial sliver spanning radius [R−depth, R], oversized outward by `margin`
        // (and tangentially) so the tool clears the disk rim for a robust Boolean cut.
        const margin = Math.max(0.1, 0.02 * R);
        const tool = {
          shape: 'box', material: p.material,
          center: [R - depth / 2 + margin / 2, 0, cz],
          size: { x: depth + margin, y: chordW + 2 * margin, z: hh },
        };
        const name = `seg_${i}_cut_${j}`;
        body.push(vbaBrick(tool, name, comp));
        const rot = vbaRotateZ(comp, name, cut.angleDeg);
        if (rot) body.push(rot);
        body.push(vbaSubtract(comp, `seg_${i}`, name));
      });
      if (p.slot && num(p.slot.lengthMm) > 0) {
        const slotTool = {
          shape: 'box', material: p.material,
          center: [0, 0, cz],
          size: { x: num(p.slot.widthMm), y: num(p.slot.lengthMm), z: hh },
        };
        const name = `seg_${i}_slot`;
        body.push(vbaBrick(slotTool, name, comp));
        const rot = vbaRotateZ(comp, name, p.slot.angleDeg);
        if (rot) body.push(rot);
        body.push(vbaSubtract(comp, `seg_${i}`, name));
      }
    } else if (p.shape === 'trace') {
      body.push(vbaExtrudePolygon(`trace_${i}`, comp, p.material, p.outline, num(p.center[2]), p.thickness));
    } else if (p.shape === 'feed') {
      portN += 1;
      body.push(vbaDiscretePort(p, portN));
    }
    body.push('');
  });

  // Boundaries + solver span
  body.push('With Boundary');
  body.push('  .Xmin "open" : .Xmax "open"');
  body.push('  .Ymin "open" : .Ymax "open"');
  body.push('  .Zmin "open" : .Zmax "open"');
  body.push('End With');
  body.push('');
  body.push(`Solver.FrequencyRange ${vn(fLo)}, ${vn(fHi)}`);
  body.push('');
  body.push('End Sub');

  return header.join('\n') + '\n\n' + body.join('\n') + '\n';
}
