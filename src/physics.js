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

  // --- Outer ring: TM11 cavity-model resonance (validated single-ring synthesis) ---
  let aeff = 0, rhoEff = rho_in;
  for (let it = 0; it < 5; it++) {
    const xr = annularRoot(rhoEff);
    aeff = (xr * c) / (2 * Math.PI * fHz * Math.sqrt(er));
    rhoEff = rho_in + (rho_in + 1) * dFringe / aeff;
  }
  const a = aeff + dFringe;   // outer ring inner radius
  const b = rho_in * a;       // outer ring outer radius
  const x0 = annularRoot(rho_in);

  // Q / bandwidth (cavity-loss estimate)
  const delta_s = 1 / Math.sqrt(Math.PI * fHz * MU0 * SIGMA_CU);
  const Qc = (h_mm / 1000) / delta_s;
  const Qd = 1 / tanD;
  const Qt = 1 / (1 / Qc + 1 / Qd);
  const S = 2;
  const bandwidthPct = ((S - 1) / (Qt * Math.sqrt(S))) * 100;

  // --- N concentric rings + connector bridges + edge microstrip feed ---
  // The outer ring [a,b] is the primary TM11 resonator (validated cavity model).
  // Each additional concentric ring is separated from the one outside it by a
  // radial `gap` and tied to it by a thin connector, adding further resonances —
  // a multi-ring wideband/multiband patch. Ring count is user-selectable; a ring
  // that would collapse to a non-positive radius is dropped (with a warning).
  // Dimensions are a PRELIMINARY design; the CST export is parametric for sweeps.
  const rOutO = b, rOutI = a;                 // outer ring outer / inner radii
  const ringWOuter = rOutO - rOutI;           // = b − a
  const gap = num(d.ringGapMm) || 1.0;        // radial gap between adjacent rings
  const feedW = num(d.feedWidthMm) || 1.0;    // microstrip / connector width
  const innerW = num(d.innerRingWidthMm) || 2.5;
  const reqRings = Math.max(1, Math.min(6, Math.round(num(d.ringCount) || 2)));

  // Build the ring list from outer inward; stop if a ring would collapse.
  const rings = [{ ro: rOutO, ri: rOutI }];
  for (let k = 1; k < reqRings; k++) {
    const ro = rings[k - 1].ri - gap;
    const ri = ro - innerW;
    if (ro <= 0.5 || ri <= 0.25) break;
    rings.push({ ro, ri });
  }
  const nRings = rings.length;
  if (nRings < reqRings) {
    warnings.push(`only ${nRings} of ${reqRings} rings fit — reduce gap / inner-ring width / ring count`);
  }

  const metalThk = t_mm;                       // top-metal thickness (met_t)
  const gndThk = 0.035;                         // ground copper thickness (gnd_t)
  const ov = 0.5;                               // overlap so unions merge cleanly

  // Edge microstrip feed on +x, from the outer ring rim out to the board edge.
  const feedExtend = Math.max(4, 0.4 * rOutO);  // feed-line length beyond the ring
  const edgeX = rOutO + feedExtend;             // +x board edge == port location
  const feedX1 = rOutO - ov;                    // feed starts just inside the outer rim
  const feedLen = edgeX - feedX1;
  const feedCx = (feedX1 + edgeX) / 2;

  // Rectangular board sized to enclose the outer ring + feed line, symmetric in x
  // so the edge port sits exactly on the board rim.
  const marginY = Math.max(3, 0.3 * rOutO);
  const boardHalfX = edgeX;
  const boardHalfY = rOutO + marginY;

  const conW = feedW;
  const rf = (a + b) / 2;                        // (kept for back-compat / reference)
  const metrics = {
    a, b, x0, aeff, rf, Qt, bandwidthPct,
    ringCount: nRings, ringWidthOuter: ringWOuter, gap, innerRingWidth: innerW,
    innermostRadius: rings[nRings - 1].ri, feedWidth: feedW, feedLineLength: feedLen,
    connectorWidth: conW, boardX: 2 * boardHalfX, boardY: 2 * boardHalfY, metalThk, groundThk: gndThk,
  };

  const geometry = [
    { shape: 'box', material: 'substrate', center: [0, 0, -h_mm / 2], size: { x: 2 * boardHalfX, y: 2 * boardHalfY, z: h_mm } },
    { shape: 'box', material: 'pec', center: [0, 0, -h_mm - gndThk / 2], size: { x: 2 * boardHalfX, y: 2 * boardHalfY, z: gndThk } },
  ];
  for (const r of rings) {
    geometry.push({ shape: 'ring', material: 'pec', center: [0, 0, metalThk / 2], rInner: r.ri, rOuter: r.ro, height: metalThk, axis: 'z' });
  }
  // Connector bridges on −x, one per adjacent pair, spanning each gap.
  for (let k = 0; k < nRings - 1; k++) {
    const x1 = -(rings[k].ri + ov), x2 = -(rings[k + 1].ro - ov);
    geometry.push({ shape: 'box', material: 'pec', center: [(x1 + x2) / 2, 0, metalThk / 2], size: { x: x2 - x1, y: 2 * conW, z: metalThk } });
  }
  geometry.push({ shape: 'box', material: 'pec', center: [feedCx, 0, metalThk / 2], size: { x: feedLen, y: 2 * feedW, z: metalThk } });
  geometry.push({ shape: 'feed', material: 'feed', p1: [edgeX, 0, metalThk], p2: [edgeX, 0, -h_mm - gndThk], impedance: Zin });

  // `template` selects the parametric, sweep-ready CST export in buildVba().
  return { inputs: { ...d }, metrics, warnings, geometry, template: 'concentric-ring' };
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

const SUBSTRATE_TYPES = new Set(['rect', 'disk', 'annular', 'cp']);

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

// Wrap raw CST VBA source lines into a single AddToHistory(...) block. Inner
// double-quotes are escaped (VBA doubles them); lines are joined with vbLf.
function addToHistory(label, vbaLines) {
  const q = vbaLines.map((l) => '  "' + String(l).replace(/"/g, '""') + '"').join(' & vbLf & _\n');
  return `AddToHistory("${label}", _\n${q})`;
}

// Parametric, sweep-ready CST macro for the concentric annular-ring antenna.
// Mirrors the hand-written CST style (StoreParameter + AddToHistory history
// blocks, lossy copper + real substrate, monitors, TD solver) but seeds every
// parameter from EM-1D's synthesized preliminary design, and lists suggested
// sweep ranges so the Parameter Sweep can be driven straight away.
function buildVbaConcentricRing(result, design) {
  const m = (result && result.metrics) || {};
  const warnings = (result && result.warnings) || [];
  const f0 = num(design && design.frequencyGHz) || num(m.f0);
  const Zin = num(design && design.portImpedance) || 50;
  const fmin = 0.6 * f0, fmax = 1.6 * f0;
  const fLabel = vn(f0);
  const w = num(m.ringWidthOuter), g = num(m.gap), iw = num(m.innerRingWidth);
  const N = Math.max(1, Math.round(num(m.ringCount) || 1));   // number of concentric rings

  const header = [
    "' ============================================================",
    "' EM-1D — Concentric annular-ring microstrip antenna (PRELIMINARY design)",
    `' Target f0 = ${vn(f0)} GHz | substrate eps_r=${vn(design.substrateEr)}, h=${vn(design.substrateHeightMm)} mm, tanD=${vn(design.lossTangent)}`,
    `' Rings: ${N}  |  outer r_out_o=${vn(m.b)}  ring_w=${vn(m.ringWidthOuter)}  (r_out_i=${vn(m.a)})`,
    `' Inner rings: gap=${vn(m.gap)}  in_ring_w=${vn(m.innerRingWidth)}  innermost radius=${vn(m.innermostRadius)}`,
    `' feed_w=${vn(m.feedWidth)}  board=${vn(m.boardX)} x ${vn(m.boardY)} mm  Q~${vn(m.Qt)}`,
    "'",
    "' --- Suggested parameter sweeps (Simulation > Parameter Sweep) ---",
    `'   r_out_o  : ${vn(0.9 * m.b)} .. ${vn(1.1 * m.b)}     (outer-band resonance)`,
    `'   in_ring_w: ${vn(0.5 * iw)} .. ${vn(1.5 * iw)}     (inner-band resonance)`,
    `'   gap      : 0.3 .. ${vn(2 * g)}     (inter-ring coupling -> bandwidth)`,
    `'   ring_w   : ${vn(0.6 * w)} .. ${vn(1.4 * w)}     (outer-ring bandwidth)`,
    `'   cx       : -1 .. 1     (feed/coupling asymmetry, input match)`,
  ];
  for (const wn of warnings) header.push(`' WARNING: ${String(wn).replace(/[\r\n]+/g, ' ')}`);
  header.push("' ============================================================");

  const L = [];
  L.push('Option Explicit');
  L.push('Sub Main');
  L.push('On Error Resume Next');
  L.push('Port.Delete "1"');
  L.push(`Monitor.Delete "farfield (f=${fLabel})"`);
  L.push(`Monitor.Delete "e-field (f=${fLabel})"`);
  L.push('Component.Delete "component1"');
  L.push('Material.Delete "Copper (annealed)"');
  L.push('Material.Delete "Substrate Material"');
  L.push('On Error GoTo 0');
  L.push('');

  // Units
  L.push('With Units');
  L.push('  .Geometry "mm" : .Frequency "GHz" : .Time "ns"');
  L.push('End With');
  L.push('');

  // Parameters (drivers as doubles, geometry relations as expressions)
  L.push("' ---- Parameters (defaults = EM-1D preliminary design) ----");
  const P = (n, v) => L.push(`StoreDoubleParameter "${n}", ${vn(v)}`);
  const PS = (n, e) => L.push(`StoreParameter       "${n}", "${e}"`);
  P('sub_x', num(m.boardX) / 2); P('sub_y', num(m.boardY) / 2); P('sub_h', design.substrateHeightMm);
  P('eps_r', design.substrateEr); P('tand', design.lossTangent);
  P('gnd_t', m.groundThk); P('met_t', m.metalThk); P('z0', Zin);
  P('cx', 0); P('cy', 0);
  P('r_out_o', m.b); P('ring_w', m.ringWidthOuter); PS('r_out_i', 'r_out_o - ring_w');
  P('gap', m.gap); P('in_ring_w', m.innerRingWidth);
  // Inner-ring radii derived by chaining inward: ring k outer = (ring k-1 inner) − gap.
  for (let k = 1; k < N; k++) {
    const prevInner = k === 1 ? 'r_out_i' : `r${k - 1}_i`;
    PS(`r${k}_o`, `${prevInner} - gap`);
    PS(`r${k}_i`, `r${k}_o - in_ring_w`);
  }
  PS('feed_x1', 'cx + r_out_o - 0.5'); P('feed_w', m.feedWidth); P('con_w', m.connectorWidth);
  // Connector bridge spans (inner edge of ring k) → (outer edge of ring k+1).
  for (let k = 0; k < N - 1; k++) {
    const innerEdge = k === 0 ? 'r_out_i' : `r${k}_i`;
    PS(`con${k}_x1`, `cx - ${innerEdge} - 0.5`);
    PS(`con${k}_x2`, `cx - r${k + 1}_o + 0.5`);
  }
  P('fmin', fmin); P('fmax', fmax); P('f0', f0);
  L.push('');

  // Materials
  L.push(addToHistory('define material Copper (annealed)', [
    'With Material', '.Reset', '.Name "Copper (annealed)"', '.FrqType "all"', '.Type "Lossy metal"',
    '.SetMaterialUnit "GHz","mm"', '.Mu "1.0"', '.Kappa "5.8e+007"', '.Rho "8930.0"',
    '.Colour "1","1","0"', '.Create', 'End With']));
  L.push(addToHistory('define material Substrate Material', [
    'With Material', '.Reset', '.Name "Substrate Material"', '.FrqType "all"', '.Type "Normal"',
    '.SetMaterialUnit "GHz","mm"', '.Epsilon "eps_r"', '.Mu "1.0"', '.Kappa "0.0"', '.TanD "tand"',
    '.TanDFreq "10.0"', '.TanDGiven "True"', '.TanDModel "ConstTanD"', '.Colour "0.94","0.82","0.76"',
    '.Create', 'End With']));
  L.push(addToHistory('new component component1', ['Component.New "component1"']));
  L.push('');

  // Substrate + ground (substrate top at z=sub_h; metal sits sub_h .. sub_h+met_t)
  L.push(addToHistory('define brick Substrate', [
    'With Brick', '.Reset', '.Name "Substrate"', '.Component "component1"', '.Material "Substrate Material"',
    '.Xrange "-sub_x", "sub_x"', '.Yrange "-sub_y", "sub_y"', '.Zrange "0", "sub_h"', '.Create', 'End With']));
  L.push(addToHistory('define brick Ground', [
    'With Brick', '.Reset', '.Name "Ground"', '.Component "component1"', '.Material "Copper (annealed)"',
    '.Xrange "-sub_x", "sub_x"', '.Yrange "-sub_y", "sub_y"', '.Zrange "-gnd_t", "0"', '.Create', 'End With']));

  // N concentric rings (outer + inner rings 1..N-1)
  const ringCyl = (label, name, roP, riP) => addToHistory(label, [
    'With Cylinder', '.Reset', `.Name "${name}"`, '.Component "component1"', '.Material "Copper (annealed)"',
    `.OuterRadius "${roP}"`, `.InnerRadius "${riP}"`, '.Axis "z"', '.Zrange "sub_h", "sub_h + met_t"',
    '.Xcenter "cx"', '.Ycenter "cy"', '.Segments "0"', '.Create', 'End With']);
  L.push(ringCyl('define cylinder Outer Ring', 'Outer Ring', 'r_out_o', 'r_out_i'));
  for (let k = 1; k < N; k++) L.push(ringCyl(`define cylinder Ring ${k}`, `Ring ${k}`, `r${k}_o`, `r${k}_i`));

  // Connector bridges (−x), one per adjacent ring pair
  for (let k = 0; k < N - 1; k++) {
    L.push(addToHistory(`define brick Connect ${k}`, [
      'With Brick', '.Reset', `.Name "Connect ${k}"`, '.Component "component1"', '.Material "Copper (annealed)"',
      `.Xrange "con${k}_x1", "con${k}_x2"`, '.Yrange "-con_w", "con_w"', '.Zrange "sub_h", "sub_h + met_t"', '.Create', 'End With']));
  }

  // Edge microstrip feed (+x)
  L.push(addToHistory('define brick Feed', [
    'With Brick', '.Reset', '.Name "Feed"', '.Component "component1"', '.Material "Copper (annealed)"',
    '.Xrange "feed_x1", "sub_x"', '.Yrange "-feed_w", "feed_w"', '.Zrange "sub_h", "sub_h + met_t"', '.Create', 'End With']));

  // Union all metal into the "Outer Ring" solid
  for (let k = 1; k < N; k++) L.push(addToHistory(`boolean add Ring ${k}`, [`Solid.Add "component1:Outer Ring", "component1:Ring ${k}"`]));
  for (let k = 0; k < N - 1; k++) L.push(addToHistory(`boolean add Connect ${k}`, [`Solid.Add "component1:Outer Ring", "component1:Connect ${k}"`]));
  L.push(addToHistory('boolean add Feed', ['Solid.Add "component1:Outer Ring", "component1:Feed"']));
  L.push('');

  // Frequency, monitors
  L.push(addToHistory('define frequency range', ['Solver.FrequencyRange "fmin", "fmax"']));
  L.push(addToHistory(`define monitor farfield (f=${fLabel})`, [
    'With Monitor', '.Reset', `.Name "farfield (f=${fLabel})"`, '.Domain "Frequency"', '.FieldType "Farfield"',
    '.MonitorValue "f0"', '.ExportFarfieldSource "False"', '.Create', 'End With']));
  L.push(addToHistory(`define monitor e-field (f=${fLabel})`, [
    'With Monitor', '.Reset', `.Name "e-field (f=${fLabel})"`, '.Dimension "Volume"', '.Domain "Frequency"',
    '.FieldType "Efield"', '.MonitorValue "f0"', '.Create', 'End With']));

  // Discrete port at the +x board edge (coordinate-based, no edge picking)
  L.push(addToHistory('define discrete port 1', [
    'WCS.ActivateWCS "global"', 'With DiscretePort', '.Reset', '.PortNumber "1"', '.Type "SParameter"',
    '.Impedance "z0"', '.Voltage "1.0"', '.Current "1.0"',
    '.SetP1 "False", "sub_x", "0", "sub_h + met_t"', '.SetP2 "False", "sub_x", "0", "-gnd_t"',
    '.InvertDirection "False"', '.LocalCoordinates "False"', '.Monitor "True"', '.Radius "0.0"', '.Wire ""',
    '.Create', 'End With']));
  L.push('');

  // Boundaries, mesh, time-domain solver
  L.push('With Boundary');
  L.push('  .Xmin "open" : .Xmax "open" : .Ymin "open" : .Ymax "open" : .Zmin "open" : .Zmax "open"');
  L.push('End With');
  L.push(addToHistory('define mesh settings', [
    'With MeshSettings', '.SetMeshType "Hex"', '.Set "StepsPerWaveNear", "10"', '.Set "StepsPerWaveFar", "10"',
    '.Set "StepsPerBoxNear", "10"', 'End With']));
  L.push(addToHistory('set solver type and mesh creator', [
    'ChangeSolverType "HF Time Domain"', 'Mesh.SetCreator "High Frequency"']));
  L.push(addToHistory('define time domain solver', [
    'With Solver', '.Method "Hexahedral"', '.CalculationType "TD-S"', '.StimulationPort "All"',
    '.StimulationMode "All"', '.SteadyStateLimit "-40"', '.MeshAdaption "False"', '.AutoNormImpedance "True"',
    '.NormingImpedance "50"', 'End With']));
  L.push('');
  L.push('End Sub');

  return header.join('\n') + '\n\n' + L.join('\n') + '\n';
}

export function buildVba(result, design) {
  if (result && result.template === 'concentric-ring') return buildVbaConcentricRing(result, design || {});
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
