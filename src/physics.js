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
// Hammerstad–Wheeler microstrip *synthesis*: the width w (mm) of a line of
// characteristic impedance z0 on a substrate of permittivity er and height h.
// Two branches with disjoint validity; evaluate the narrow one first and fall
// through to the wide one when it lands outside its own range.
// Reference: Hammerstad (1975); reproduced in Pozar, *Microwave Engineering* §3.8
// — er=2.2, h=1.575 mm, z0=50 Ω gives W/h = 3.081 (verified in the test suite).
export function microstripWidth(z0, er, h) {
  const Z = num(z0), e = num(er), H = num(h);
  if (!(Z > 0) || !(e >= 1) || !(H > 0)) return NaN;
  // narrow branch, valid for W/h < 2
  const A = (Z / 60) * Math.sqrt((e + 1) / 2) + ((e - 1) / (e + 1)) * (0.23 + 0.11 / e);
  const whNarrow = 8 * Math.exp(A) / (Math.exp(2 * A) - 2);
  if (whNarrow < 2) return whNarrow * H;
  // wide branch, valid for W/h > 2
  const B = 377 * Math.PI / (2 * Z * Math.sqrt(e));
  const whWide = (2 / Math.PI) * (B - 1 - Math.log(2 * B - 1)
    + ((e - 1) / (2 * e)) * (Math.log(B - 1) + 0.39 - 0.61 / e));
  return whWide * H;
}

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

// ---------------------------------------------------------------------------
// Out-of-plane (z) strain compensation for embedded liquid-metal channels.
//
// A liquid metal has no stiffness, so an injected channel cannot "unfold" the
// way a stiff copper serpentine does — the channel is a void in the elastomer
// and deforms affinely with it. An in-plane serpentine therefore gives no
// length-invariance at all (it tracks a plain circle exactly).
//
// A channel that also undulates in z does work, and needs no stiffness contrast:
// PDMS is near-incompressible (ν≈0.5), so in-plane stretch compresses z, which
// flattens the wave and releases arc length at close to the rate the perimeter
// demands. The compensation is built into the affine transform itself.
//
// The optimum is a dimensionless ratio a/λ ≈ 0.18 (λ = in-plane path per z
// cycle) and is scale-invariant, so it is solved once on a unit loop.
// ---------------------------------------------------------------------------

// Arc length of the serpentine centerline with an added z undulation, evaluated
// under an affine stretch (sx, sy, sz). az is the z amplitude, mz the number of
// z cycles per turn.
export function serpArc3D(R, A, S, n, az, mz, sx = 1, sy = 1, sz = 1, N = 1500) {
  let L = 0, px = 0, py = 0, pz = 0;
  for (let i = 0; i <= N; i++) {
    const t = (2 * Math.PI * i) / N;
    const u = R + A * Math.sin(n * t), v = S * Math.sin(2 * n * t);
    const x = (u * Math.cos(t) + v * Math.sin(t)) * sx;
    const y = (u * Math.sin(t) - v * Math.cos(t)) * sy;
    const z = az * Math.sin(mz * t) * sz;
    if (i) L += Math.hypot(x - px, y - py, z - pz);
    px = x; py = y; pz = z;
  }
  return L;
}

// Worst |ΔL/L| over 0..maxStrain for a unit loop at z-amplitude ratio `ratio`.
// Scale-invariant, so R = 1 is general.
export function serpZDrift(ratio, n, a, s, mz, maxStrain, nu = 0.5) {
  const R = 1, A = a, S = s;
  const lam = serpArc3D(R, A, S, n, 0, mz) / mz;   // in-plane path per z cycle
  const az = ratio * lam;
  const L0 = serpArc3D(R, A, S, n, az, mz);
  let worst = 0;
  for (let k = 1; k <= 4; k++) {
    const e = (maxStrain * k) / 4;
    const L = serpArc3D(R, A, S, n, az, mz, 1 + e, 1 - nu * e, 1 - nu * e);
    worst = Math.max(worst, Math.abs(L / L0 - 1));
  }
  return worst;
}

// Solve the z-amplitude ratio that minimises frequency drift over the strain
// range: coarse scan then golden-section refinement.
export function solveSerpZRatio(n, a, s, mz, maxStrain, nu = 0.5) {
  if (!(maxStrain > 0)) return 0;
  let best = 0, bestD = Infinity;
  for (let r = 0; r <= 0.45; r += 0.015) {
    const dr = serpZDrift(r, n, a, s, mz, maxStrain, nu);
    if (dr < bestD) { bestD = dr; best = r; }
  }
  let lo = Math.max(0, best - 0.02), hi = best + 0.02;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (serpZDrift(m1, n, a, s, mz, maxStrain, nu) < serpZDrift(m2, n, a, s, mz, maxStrain, nu)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
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
  // An embedded liquid-metal channel (PDMS cast around a sacrificial core, then
  // injected) is a fundamentally different conductor: a round channel buried in
  // bulk dielectric rather than a flat trace on a surface.
  const embedded = d.conductorForm === 'Embedded channel';
  const chanD = num(d.channelDiaMm) || 0.5;
  const mz = Math.max(4, Math.round(num(d.zCycles) || 48));
  const maxStrain = Math.max(0, num(d.maxStrainPct) || 0) / 100;
  const grounded = !embedded && (d.groundPlane || 'Full') === 'Full';
  const warnings = [];
  if (embedded && (d.groundPlane || 'Full') === 'Full') {
    warnings.push('ground plane ignored for an embedded channel — a loop needs no counterpoise, and a ground plane would both suppress radiation and have to stretch');
  }

  let n = Math.round(num(d.undulations));
  if (!(n >= 4)) { n = 4; warnings.push('undulations n coerced to a minimum of 4'); }

  // Effective permittivity. Embedded: the conductor sees dielectric on every
  // side, so eeff → εr — the maximum-loading case, NOT the (εr+1)/2 of a surface
  // trace and emphatically not the →1 of a thin film.
  const eeff = embedded
    ? er
    : grounded
      ? (er + 1) / 2 + (er - 1) / 2 * Math.pow(1 + 12 * h / w, -0.5)
      : (er > 1 ? (er + 1) / 2 : 1);
  const lam0 = C_MM_PER_NS / fGHz;
  const lamg = lam0 / Math.sqrt(eeff);

  const G = serpShapeFactor(n, a, s);
  // Out-of-plane compensation ratio, solved for the requested strain range.
  const zRatio = embedded ? solveSerpZRatio(n, a, s, mz, maxStrain) : 0;
  const zDrift = embedded ? serpZDrift(zRatio, n, a, s, mz, maxStrain) : null;
  const flatDrift = embedded ? serpZDrift(0, n, a, s, mz, maxStrain) : null;

  // 1λ loop: the *3D* conductor arc length must equal λg. The z-wave adds arc
  // length, so R shrinks relative to the flat design — solve it by bisection.
  let R;
  if (embedded && zRatio > 0) {
    const arcAt = (Rc) => {
      const lam = serpArc3D(Rc, a * Rc, s * Rc, n, 0, mz) / mz;
      return serpArc3D(Rc, a * Rc, s * Rc, n, zRatio * lam, mz);
    };
    let lo = 0.05 * lamg / G, hi = 2 * lamg / G;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; (arcAt(m) < lamg) ? lo = m : hi = m; }
    R = (lo + hi) / 2;
  } else {
    R = lamg / G;
  }
  const A = a * R, S = s * R;
  // z amplitude in mm, from the scale-invariant ratio
  const zAmp = embedded ? zRatio * (serpArc3D(R, A, S, n, 0, mz) / mz) : 0;
  const outerR = R + A;
  const condW = embedded ? chanD : w;
  const footprintD = 2 * outerR + condW;
  const meander = G / (2 * Math.PI);
  const plainLoopD = lamg / Math.PI;
  const miniaturize = plainLoopD / footprintD;
  const Rrad = grounded ? null : 100;

  // Feed topology follows the ground plane, because the two configurations are
  // different antennas. Ungrounded: a free-standing 1λ loop, correctly excited by
  // a balanced delta-gap source across a break in the conductor. Grounded: a
  // microstrip resonator whose ground IS the return conductor, so the loop closes
  // galvanically and is fed by a 50 Ω line to the board edge with the port
  // referenced to ground. A delta-gap source in the trace plane has no return path
  // over a ground plane, so it would excite the structure unphysically.
  const edgeFed = grounded;
  if (grounded) warnings.push('full ground ~h behind the loop suppresses radiation; grounded loop behaves as a resonator, not an efficient 1λ radiator');

  // Centerline. Closed over [0,2π) when edge-fed; broken at t=0 for the delta gap.
  const s0 = serpSpeed(0, n, a, s) * R;
  const dGap = Math.min(0.6, g / Math.max(s0, 1e-6));
  if (!edgeFed && dGap >= Math.PI / n) warnings.push('feed gap large relative to undulation spacing');
  const t0 = edgeFed ? 0 : dGap / 2;
  const t1 = edgeFed ? 2 * Math.PI : 2 * Math.PI - dGap / 2;
  const M = Math.max(720, 16 * n);
  // A closed loop must not duplicate the seam point, so it samples [0,2π) over M
  // steps; an open ribbon samples both endpoints over M+1.
  const last = edgeFed ? M - 1 : M;
  const spine = [];
  for (let i = 0; i <= last; i++) spine.push(serpPoint(t0 + (t1 - t0) * i / M, R, A, S, n));

  // Offset ±w/2 along the centerline normal. Open → one ribbon polygon (left edge
  // then right edge reversed). Closed → two separate rings, outer and inner, and
  // the trace becomes an annulus (a polygon with a hole).
  const wrap = (i) => (edgeFed ? (i + spine.length) % spine.length : Math.min(last, Math.max(0, i)));
  const left = [], right = [];
  for (let i = 0; i <= last; i++) {
    const p = spine[i];
    const b = spine[wrap(i + 1)], q = spine[wrap(i - 1)];
    let tx = b[0] - q[0], ty = b[1] - q[1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const nx = -ty, ny = tx;
    left.push([p[0] + nx * w / 2, p[1] + ny * w / 2]);
    right.push([p[0] - nx * w / 2, p[1] - ny * w / 2]);
  }
  // coarse self-overlap check: non-adjacent centerline points closer than w
  const stepc = Math.max(1, Math.floor((last + 1) / 160));
  const sep = Math.max(1, Math.floor((last + 1) / (2 * n)));   // skip same-strand neighbors (< half an undulation apart)
  let minSep = Infinity;
  for (let i = 0; i <= last; i += stepc)
    for (let j = i + sep; j <= last; j += stepc) {
      // Open ribbon: skip the two ends straddling the feed gap (~g apart, not an
      // overlap). Closed loop: the seam is continuous, so wrap the separation.
      const arc = edgeFed ? Math.min(j - i, last + 1 - (j - i)) : j - i;
      if (arc < sep) continue;
      if (!edgeFed && j - i > last - sep) continue;
      const dd = Math.hypot(spine[i][0] - spine[j][0], spine[i][1] - spine[j][1]);
      if (dd < minSep) minSep = dd;
    }
  if (minSep < w) warnings.push('trace may self-overlap — reduce trace width or undulations');

  // 50 Ω edge feed: line width from microstrip synthesis, run radially out along
  // +x from the loop rim to the board edge.
  const feedW = edgeFed ? microstripWidth(Zin, er, h) : null;
  const feedLen = edgeFed ? Math.max(5, 4 * h) : 0;
  if (edgeFed && !(feedW > 0)) warnings.push('microstrip feed width did not converge — check εr and substrate height');
  // A 50 Ω line on a thick, low-εr substrate can be wider than one undulation of
  // the meander. Where it lands it bridges adjacent strands, shorting out part of
  // the resonant path and pushing f0 up — the synthesized R no longer holds.
  const undulationPitch = 2 * Math.PI * R / n;
  if (edgeFed && feedW > undulationPitch) {
    warnings.push(`50 Ω feed line (${feedW.toFixed(2)} mm) is wider than the undulation pitch `
      + `(${undulationPitch.toFixed(2)} mm) and will short across the meander — `
      + 'use a thinner substrate, fewer undulations, or taper the line at the junction');
  }
  // The line must bond to the conductor, so it starts at x = R: serpPoint(0) is
  // exactly (R, 0), i.e. the centerline crosses the +x axis there, so that point
  // is guaranteed to be inside the ribbon for any n/A/S. The tangent at t=0 is
  // near-radial, so the stub runs alongside the conductor out to the rim rather
  // than bridging across a gap — generous, self-consistent contact.
  const rimX = R;
  const boardHalf = edgeFed ? outerR + w / 2 + feedLen : (footprintD + 6 * h) / 2;
  const span = 2 * boardHalf;

  // Orientation matters for the closed loop. The curve runs counter-clockwise, and
  // for a CCW curve the left normal (-ty, tx) points *inward* — on a circle
  // t̂ = (-sin t, cos t) gives n = (-cos t, -sin t), i.e. toward the origin. So
  // `right` is the outer boundary and `left` is the hole. Swapping these makes the
  // CST Boolean subtract the larger from the smaller, silently deleting the solid.
  const outline = edgeFed ? right : left.concat(right.reverse());
  const inner = edgeFed ? left : null;

  // Conductor loss. EGaIn is ~17x more resistive than copper, but an injected
  // channel is ~30x fatter than rolled foil, so surface area more than repays it.
  const sigma = embedded ? 3.4e6 : 5.8e7;         // EGaIn vs annealed copper, S/m
  const Rs = Math.sqrt(Math.PI * fGHz * 1e9 * 4e-7 * Math.PI / sigma);
  const perim = embedded ? Math.PI * chanD : 2 * (condW + t);
  const arc3D = embedded ? serpArc3D(R, A, S, n, zAmp, mz) : R * G;
  const Rloss = Rs * (arc3D / perim);
  const efficiency = Rrad != null ? Rrad / (Rrad + Rloss) : null;

  // Slab must fully bury the undulating channel: one channel diameter of cover
  // on each face beyond the wave envelope.
  const slabNeed = embedded ? chanD + 2 * zAmp + 2 * chanD : 0;
  const slabZ = embedded ? Math.max(h, slabNeed) : h;

  const metrics = { R, A, S, outerR, footprintD, Lpath: arc3D, G, meander,
    eeff, lamg, plainLoopD, miniaturize, Rrad, n, grounded, feedGap: edgeFed ? 0 : g,
    feedType: edgeFed ? 'microstrip-edge' : 'delta-gap',
    feedWidth: feedW, feedLineLength: edgeFed ? boardHalf - rimX : 0,
    boardSpan: span,
    embedded, channelDia: embedded ? chanD : null,
    zAmp: embedded ? zAmp : null, zRatio: embedded ? zRatio : null, zCycles: embedded ? mz : null,
    // frequency drift over the strain range: with the z-wave vs a flat channel
    driftPct: zDrift == null ? null : zDrift * 100,
    flatDriftPct: flatDrift == null ? null : flatDrift * 100,
    maxStrainPct: embedded ? maxStrain * 100 : null,
    slabZ: embedded ? slabZ : null,
    Rloss, efficiency };

  // BLE 2.400–2.4835 GHz: f0 must hold within ±1.71% across the strain range.
  if (embedded && maxStrain > 0) {
    const BLE_HALF_PCT = 1.71;
    if (zDrift * 100 > BLE_HALF_PCT) {
      warnings.push(`f0 drifts ${(zDrift * 100).toFixed(2)}% over ${(maxStrain * 100).toFixed(0)}% strain, `
        + `beyond the ±${BLE_HALF_PCT}% BLE band budget — reduce the strain range at the antenna `
        + '(stiffen that zone) or widen the channel to lower Q');
    }
  }

  const tg = t;   // ground copper reuses the conductor thickness
  const geometry = [];
  if (embedded) {
    // Swept round channel following the 3D centerline, buried mid-slab. Broken at
    // t=0 for the differential feed gap, exactly as the free-standing loop is.
    const PTS = Math.max(720, 16 * n, 6 * mz);
    const path = [];
    for (let i = 0; i <= PTS; i++) {
      const tt = t0 + (t1 - t0) * i / PTS;
      const p = serpPoint(tt, R, A, S, n);
      path.push([p[0], p[1], zAmp * Math.sin(mz * tt)]);
    }
    geometry.push({ shape: 'tube', material: 'lm', path, radius: chanD / 2 });
  } else {
    const trace = { shape: 'trace', material: 'pec', outline, center: [0, 0, t / 2], thickness: t };
    if (inner) trace.inner = inner;
    geometry.push(trace);
  }
  if (edgeFed) {
    const x0 = rimX, x1 = boardHalf;
    geometry.push({ shape: 'box', material: 'pec', center: [(x0 + x1) / 2, 0, t / 2],
      size: { x: x1 - x0, y: feedW, z: t } });
  }
  if (embedded) {
    if (h < slabNeed) {
      warnings.push(`substrate thickened to ${slabZ.toFixed(2)} mm to bury the channel `
        + `(Ø${chanD} mm undulating ±${zAmp.toFixed(2)} mm needs cover on both faces)`);
    }
    geometry.push({ shape: 'box', material: 'substrate', center: [0, 0, 0], size: { x: span, y: span, z: slabZ } });
    // Differential delta gap across the channel ends, at their true 3D positions.
    const e0 = serpPoint(t0, R, A, S, n), e1 = serpPoint(t1, R, A, S, n);
    geometry.push({ shape: 'feed', material: 'feed',
      p1: [e0[0], e0[1], zAmp * Math.sin(mz * t0)],
      p2: [e1[0], e1[1], zAmp * Math.sin(mz * t1)], impedance: Zin });
  } else {
    if (er > 1) geometry.push({ shape: 'box', material: 'substrate', center: [0, 0, -h / 2], size: { x: span, y: span, z: h } });
    if (grounded) geometry.push({ shape: 'box', material: 'pec', center: [0, 0, -h - tg / 2], size: { x: span, y: span, z: tg } });
    if (edgeFed) {
      // Vertical port at the board edge: microstrip top conductor → ground plane.
      geometry.push({ shape: 'feed', material: 'feed', p1: [boardHalf, 0, t], p2: [boardHalf, 0, -h - tg], impedance: Zin });
    } else {
      // Delta gap: endpoints at the conductor mid-plane so they land inside the metal.
      geometry.push({ shape: 'feed', material: 'feed', p1: [spine[0][0], spine[0][1], t / 2], p2: [spine[last][0], spine[last][1], t / 2], impedance: Zin });
    }
  }

  // `template` selects the parametric, sweep-ready CST export in buildVba().
  return { inputs: { ...d }, metrics, warnings, geometry, template: 'serpentine' };
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

// NOTE: CST has two generations of the DiscretePort point API — the legacy
// Point1/Point2/UsePickedPoints trio and the modern SetP1/SetP2 pair. Mixing
// them raises "(&H8000ffff) do not mix old ... with new ... commands" and aborts
// the macro, so this must emit SetP1/SetP2 *only*.
function vbaDiscretePort(p, n) {
  const a = p.p1, b = p.p2;
  return [
    'With DiscretePort',
    '  .Reset',
    `  .PortNumber ${n}`,
    '  .Type "SParameter"',
    `  .Impedance ${vn(p.impedance)}`,
    `  .SetP1 "False", "${vn(a[0])}", "${vn(a[1])}", "${vn(a[2])}"`,
    `  .SetP2 "False", "${vn(b[0])}", "${vn(b[1])}", "${vn(b[2])}"`,
    '  .InvertDirection "False"',
    '  .LocalCoordinates "False"',
    '  .Monitor "True"',
    '  .Create',
    'End With',
  ].join('\n');
}

// Vacuum padding between the structure and the absorbing boundary. `spaceExpr`
// is a CST expression (a parameter name or a literal) evaluated in mm; λ0/4 is
// the usual choice. Without this an `open` boundary lands in the reactive near
// field and CST refuses to place a port within three mesh steps of it.
function vbaBackgroundSpace(spaceExpr) {
  return [
    'With Background',
    '  .ResetBackground',
    '  .Type "Normal"',
    '  .Epsilon "1.0"',
    '  .Mu "1.0"',
    '  .ApplyInAllDirections "False"',
    ...['Xmin', 'Xmax', 'Ymin', 'Ymax', 'Zmin', 'Zmax'].map((f) => `  .${f}Space "${spaceExpr}"`),
    'End With',
  ];
}

// Wrap raw CST VBA source lines into a single AddToHistory(...) block. Inner
// double-quotes are escaped (VBA doubles them); lines are joined with vbLf.
function addToHistory(label, vbaLines) {
  const q = vbaLines.map((l) => '  "' + String(l).replace(/"/g, '""') + '"').join(' & vbLf & _\n');
  return `AddToHistory("${label}", _\n${q})`;
}

// Same, but accumulated into the `h` string variable instead of one statement
// spanning N line-continuations. VBA caps continuations per statement (24 in
// VBA6), so any block longer than ~12 lines must be built this way. Callers
// must declare `Dim h As String` once in the enclosing Sub.
function addToHistoryLong(label, vbaLines) {
  const out = ['h = ""'];
  for (const l of vbaLines) out.push(`h = h & "${String(l).replace(/"/g, '""')}" & vbLf`);
  out.push(`AddToHistory "${label}", h`);
  return out.join('\n');
}

// Pick the compact or accumulator form by length. `src` may be a joined block.
const HIST_INLINE_MAX = 12;
function hist(label, src) {
  const lines = (Array.isArray(src) ? src : String(src).split('\n')).filter((l) => String(l).trim() !== '');
  return lines.length <= HIST_INLINE_MAX ? addToHistory(label, lines) : addToHistoryLong(label, lines);
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
  L.push('Dim h As String');   // 'define background' is a long block → addToHistoryLong needs `h`
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
  PS('bg_space', '299.792458 / f0 / 4');   // lambda0/4 vacuum padding to the open boundary
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
  L.push(hist('define background', vbaBackgroundSpace('bg_space')));
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

// ---------------------------------------------------------------------------
// Parametric serpentine-loop export
//
// The trace is a ~1440-point offset ribbon, so naming parameters alongside
// literal .LineTo coordinates would be inert — sweeping serp_R could not move a
// single point. Instead the curve evaluator itself is emitted *as the body of a
// history block*: it reads the drivers with RestoreDoubleParameter and rebuilds
// the polygon every time CST replays the history. That makes serp_R / amp_ratio
// / serp_ratio / serp_n / trace_w / feed_gap genuine sweep and optimiser
// variables, and keeps the history entry ~60 lines instead of ~1450.
// ---------------------------------------------------------------------------

// Shared preamble: recover the centreline drivers and the feed-gap parameter
// span from the CST parameter list. Mirrors serpSpeed(0)·R analytically —
// |r'(0)| = hypot(A·n, R − 2nS) — so no quadrature is needed inside CST.
function serpPreamble(edgeFed) {
  const base = [
    'PI = 4 * Atn(1)',
    'R   = RestoreDoubleParameter("serp_R")',
    'Am  = R * RestoreDoubleParameter("amp_ratio")',
    'Sk  = R * RestoreDoubleParameter("serp_ratio")',
    'nU  = CLng(RestoreDoubleParameter("serp_n"))',
  ];
  if (edgeFed) {
    // Edge-fed loops close galvanically: the full period, no gap.
    return [...base, 'tA = 0', 'tB = 2 * PI'];
  }
  return [...base,
    'gp  = RestoreDoubleParameter("feed_gap")',
    "' feed gap: arc length g at t=0 -> parameter span dg = g / |r'(0)|, capped at 0.6 rad",
    's0 = Sqr((Am * nU) * (Am * nU) + (R - 2 * nU * Sk) * (R - 2 * nU * Sk))',
    'If s0 < 0.000001 Then s0 = 0.000001',
    'dg = gp / s0',
    'If dg > 0.6 Then dg = 0.6',
    'tA = dg / 2',
    'tB = 2 * PI - dg / 2',
  ];
}

// One Pointlist extrude over an offset edge. `arr` names the x/y arrays.
function serpExtrude(name, material, ax, ay) {
  return [
    'With Extrude',
    '  .Reset',
    `  .Name "${name}"`,
    '  .Component "component1"',
    `  .Material "${material}"`,
    '  .Mode "Pointlist"',
    '  .Height ht',
    '  .Twist 0.0',
    '  .Taper 0.0',
    '  .Origin 0, 0, 0',
    '  .Uvector 1, 0, 0',
    '  .Vvector 0, 1, 0',
    `  .Point ${ax}(0), ${ay}(0)`,
    '  For i = 1 To Lst',
    `    .LineTo ${ax}(i), ${ay}(i)`,
    '  Next i',
    '  .Create',
    'End With',
  ];
}

// Embedded liquid-metal channel: a 3D centerline curve swept with a circular
// section. CST builds this as a Polygon3D curve wrapped in a CurveWire solid,
// which is the only shape vocabulary that expresses an out-of-plane path.
function serpChannelBlock() {
  return [
    "' Embedded channel centreline, rebuilt from the parameter list every replay.",
    "' in-plane  x = (R + A sin nt) cos t + S sin 2nt sin t",
    "'           y = (R + A sin nt) sin t - S sin 2nt cos t",
    "' out-of-plane  z = z_amp sin(z_cyc t)   <- the strain-compensating wave",
    'Dim R As Double, Am As Double, Sk As Double, gp As Double, zamp As Double',
    'Dim s0 As Double, dg As Double, tA As Double, tB As Double, dt As Double, tt As Double',
    'Dim uu As Double, vv As Double, ct As Double, st As Double, PI As Double',
    'Dim nU As Long, mzz As Long, M As Long, i As Long',
    ...serpPreamble(false),
    'zamp = RestoreDoubleParameter("z_amp")',
    'mzz  = CLng(RestoreDoubleParameter("z_cyc"))',
    "' resolve both the meander and the z wave",
    'M = 16 * nU',
    'If 12 * mzz > M Then M = 12 * mzz',
    'If M < 720 Then M = 720',
    'dt = (tB - tA) / M',
    'Curve.NewCurve "serpcurve"',
    'With Polygon3D',
    '  .Reset',
    '  .Name "serp3d"',
    '  .Curve "serpcurve"',
    '  For i = 0 To M',
    '    tt = tA + dt * i',
    '    uu = R + Am * Sin(nU * tt)',
    '    vv = Sk * Sin(2 * nU * tt)',
    '    ct = Cos(tt)',
    '    st = Sin(tt)',
    '    .Point uu * ct + vv * st, uu * st - vv * ct, zamp * Sin(mzz * tt)',
    '  Next i',
    '  .Create',
    'End With',
    'With Wire',
    '  .Reset',
    '  .Name "Channel"',
    '  .Folder ""',
    '  .Type "CurveWire"',
    '  .Radius "chan_r"',
    '  .Curve "serpcurve:serp3d"',
    '  .Material "EGaIn"',
    '  .SolidWireModel "True"',
    '  .Add',
    'End With',
  ];
}

// Differential delta-gap port across the channel ends, in 3D (the endpoints
// carry the z-wave offset, so they must be evaluated, not written as constants).
function serpChannelPortBlock() {
  return [
    "' Differential feed across the channel ends (3D, includes the z offset).",
    'Dim R As Double, Am As Double, Sk As Double, gp As Double, zamp As Double',
    'Dim s0 As Double, dg As Double, tA As Double, tB As Double, PI As Double',
    'Dim uu As Double, vv As Double, ct As Double, st As Double',
    'Dim p1x As Double, p1y As Double, p1z As Double',
    'Dim p2x As Double, p2y As Double, p2z As Double',
    'Dim nU As Long, mzz As Long',
    ...serpPreamble(false),
    'zamp = RestoreDoubleParameter("z_amp")',
    'mzz  = CLng(RestoreDoubleParameter("z_cyc"))',
    'uu = R + Am * Sin(nU * tA) : vv = Sk * Sin(2 * nU * tA)',
    'ct = Cos(tA) : st = Sin(tA)',
    'p1x = uu * ct + vv * st : p1y = uu * st - vv * ct : p1z = zamp * Sin(mzz * tA)',
    'uu = R + Am * Sin(nU * tB) : vv = Sk * Sin(2 * nU * tB)',
    'ct = Cos(tB) : st = Sin(tB)',
    'p2x = uu * ct + vv * st : p2y = uu * st - vv * ct : p2z = zamp * Sin(mzz * tB)',
    'WCS.ActivateWCS "global"',
    'With DiscretePort',
    '  .Reset',
    '  .PortNumber "1"',
    '  .Type "SParameter"',
    '  .Impedance "z0"',
    '  .Voltage "1.0"',
    '  .Current "1.0"',
    '  .SetP1 "False", p1x, p1y, p1z',
    '  .SetP2 "False", p2x, p2y, p2z',
    '  .InvertDirection "False"',
    '  .LocalCoordinates "False"',
    '  .Monitor "True"',
    '  .Radius "0.0"',
    '  .Wire ""',
    '  .Create',
    'End With',
  ];
}

function serpTraceBlock(material, edgeFed) {
  const head = [
    "' Serpentine ribbon, rebuilt from the parameter list on every history replay.",
    "' centreline  x = (R + A sin nt) cos t + S sin 2nt sin t",
    "'             y = (R + A sin nt) sin t - S sin 2nt cos t",
    'Dim R As Double, Am As Double, Sk As Double, wid As Double, gp As Double, ht As Double',
    'Dim s0 As Double, dg As Double, tA As Double, tB As Double, dt As Double, tt As Double',
    'Dim uu As Double, vv As Double, ct As Double, st As Double',
    'Dim tx As Double, ty As Double, nrm As Double, PI As Double',
    'Dim nU As Long, M As Long, Lst As Long, i As Long, ia As Long, ib As Long',
    'Dim px() As Double, py() As Double',
    'Dim lx() As Double, ly() As Double, rx() As Double, ry() As Double',
    ...serpPreamble(edgeFed),
    'wid = RestoreDoubleParameter("trace_w")',
    'ht  = RestoreDoubleParameter("met_t")',
    "' sample density follows n so every undulation keeps ~16 facets",
    'M = 16 * nU',
    'If M < 720 Then M = 720',
    // A closed loop must not repeat the seam point; an open ribbon keeps both ends.
    edgeFed ? 'Lst = M - 1' : 'Lst = M',
    'ReDim px(Lst) : ReDim py(Lst)',
    'ReDim lx(Lst) : ReDim ly(Lst) : ReDim rx(Lst) : ReDim ry(Lst)',
    'dt = (tB - tA) / M',
    'For i = 0 To Lst',
    '  tt = tA + dt * i',
    '  uu = R + Am * Sin(nU * tt)',
    '  vv = Sk * Sin(2 * nU * tt)',
    '  ct = Cos(tt)',
    '  st = Sin(tt)',
    '  px(i) = uu * ct + vv * st',
    '  py(i) = uu * st - vv * ct',
    'Next i',
    "' offset +-w/2 along the finite-difference normal",
    'For i = 0 To Lst',
    '  ia = i - 1',
    // closed: neighbours wrap across the seam; open: clamp at the ends
    edgeFed ? '  If ia < 0 Then ia = Lst' : '  If ia < 0 Then ia = 0',
    '  ib = i + 1',
    edgeFed ? '  If ib > Lst Then ib = 0' : '  If ib > Lst Then ib = Lst',
    '  tx = px(ib) - px(ia)',
    '  ty = py(ib) - py(ia)',
    '  nrm = Sqr(tx * tx + ty * ty)',
    '  If nrm = 0 Then nrm = 1',
    '  tx = tx / nrm',
    '  ty = ty / nrm',
    '  lx(i) = px(i) - ty * wid / 2',
    '  ly(i) = py(i) + tx * wid / 2',
    '  rx(i) = px(i) + ty * wid / 2',
    '  ry(i) = py(i) - tx * wid / 2',
    'Next i',
  ];

  if (!edgeFed) {
    // Open ribbon: one simple polygon, left edge out and right edge back.
    return [...head,
      'With Extrude',
      '  .Reset',
      '  .Name "Serpentine"',
      '  .Component "component1"',
      `  .Material "${material}"`,
      '  .Mode "Pointlist"',
      '  .Height ht',
      '  .Twist 0.0',
      '  .Taper 0.0',
      '  .Origin 0, 0, 0',
      '  .Uvector 1, 0, 0',
      '  .Vvector 0, 1, 0',
      '  .Point lx(0), ly(0)',
      '  For i = 1 To Lst',
      '    .LineTo lx(i), ly(i)',
      '  Next i',
      '  For i = Lst To 0 Step -1',
      '    .LineTo rx(i), ry(i)',
      '  Next i',
      '  .Create',
      'End With',
    ];
  }
  // Closed loop: the trace is an annulus, so extrude both rings and subtract.
  // Pointlist closes each polygon implicitly, so no seam point is repeated.
  // rx/ry is the OUTER boundary and lx/ly the hole — the curve is CCW, so the
  // left normal points inward. Reversed, Solid.Subtract deletes the solid instead
  // of piercing it, and the failure only surfaces at the next command.
  return [...head,
    ...serpExtrude('Serpentine', material, 'rx', 'ry'),
    ...serpExtrude('SerpHole', material, 'lx', 'ly'),
    'Solid.Subtract "component1:Serpentine", "component1:SerpHole"',
  ];
}

// Discrete port bridging the feed gap. Recomputes only the two ribbon-end
// centreline points, so the port follows the trace under a parameter sweep.
// Edge-fed port: a vertical discrete port at the board edge spanning the
// microstrip top conductor down to the ground plane — the ground is the return
// conductor, so it must be one of the port's terminals. Fully expressible in CST
// parameters, so no VBA arithmetic is needed.
function serpEdgePortBlock() {
  return [
    "' Microstrip edge launch: top conductor -> ground plane at x = sub_x.",
    'WCS.ActivateWCS "global"',
    'With DiscretePort',
    '  .Reset',
    '  .PortNumber "1"',
    '  .Type "SParameter"',
    '  .Impedance "z0"',
    '  .Voltage "1.0"',
    '  .Current "1.0"',
    '  .SetP1 "False", "sub_x", "0", "met_t"',
    '  .SetP2 "False", "sub_x", "0", "-sub_h - gnd_t"',
    '  .InvertDirection "False"',
    '  .LocalCoordinates "False"',
    '  .Monitor "True"',
    '  .Radius "0.0"',
    '  .Wire ""',
    '  .Create',
    'End With',
  ];
}

function serpPortBlock() {
  return [
    "' Feed-gap discrete port: endpoints track the centreline at t=tA and t=tB.",
    'Dim R As Double, Am As Double, Sk As Double, gp As Double, zc As Double',
    'Dim s0 As Double, dg As Double, tA As Double, tB As Double, PI As Double',
    'Dim uu As Double, vv As Double, ct As Double, st As Double',
    'Dim p1x As Double, p1y As Double, p2x As Double, p2y As Double',
    'Dim nU As Long',
    ...serpPreamble(false),
    'zc = RestoreDoubleParameter("met_t") / 2',
    'uu = R + Am * Sin(nU * tA) : vv = Sk * Sin(2 * nU * tA)',
    'ct = Cos(tA) : st = Sin(tA)',
    'p1x = uu * ct + vv * st',
    'p1y = uu * st - vv * ct',
    'uu = R + Am * Sin(nU * tB) : vv = Sk * Sin(2 * nU * tB)',
    'ct = Cos(tB) : st = Sin(tB)',
    'p2x = uu * ct + vv * st',
    'p2y = uu * st - vv * ct',
    'WCS.ActivateWCS "global"',
    'With DiscretePort',
    '  .Reset',
    '  .PortNumber "1"',
    '  .Type "SParameter"',
    '  .Impedance "z0"',
    '  .Voltage "1.0"',
    '  .Current "1.0"',
    // picked-point flag quoted (CST's proven form); coordinates stay unquoted so
    // they resolve to the VBA doubles computed above
    '  .SetP1 "False", p1x, p1y, zc',
    '  .SetP2 "False", p2x, p2y, zc',
    '  .InvertDirection "False"',
    '  .LocalCoordinates "False"',
    '  .Monitor "True"',
    '  .Radius "0.0"',
    '  .Wire ""',
    '  .Create',
    'End With',
  ];
}

function buildVbaSerpentine(result, design) {
  const m = (result && result.metrics) || {};
  const warnings = (result && result.warnings) || [];
  const f0 = num(design.frequencyGHz) || num(m.f0);
  const Zin = num(design.portImpedance) || 50;
  const er = num(design.substrateEr) || 1;
  const grounded = !!m.grounded;
  const edgeFed = m.feedType === 'microstrip-edge';
  const embedded = !!m.embedded;
  const cond = embedded ? 'EGaIn' : 'Copper (annealed)';
  const hasSub = er > 1;
  const fLabel = vn(f0);
  const R = num(m.R);
  const ampRatio = num(design.ampRatio);
  const serpRatio = num(design.serpRatio);
  const w = num(design.traceWidthMm) || 1.0;
  const t = num(design.conductorThicknessMm) || 0.035;
  const h = num(design.substrateHeightMm) || 1.6;

  const header = [
    "' ============================================================",
    "' EM-1D — Serpentine (meander) loop antenna, PARAMETRIC export",
    `' Target f0 = ${fLabel} GHz | 1λ loop, R·G = λg`,
    `' Substrate: ${hasSub ? `eps_r=${vn(er)}, h=${vn(h)} mm, tanD=${vn(design.lossTangent)}` : 'air'}`
      + `  |  ground: ${grounded ? 'full' : 'none'}`,
    `' R=${vn(R)}  A=${vn(m.A)}  S=${vn(m.S)}  n=${vn(m.n)}  w=${vn(w)} mm`,
    `' Loop path L=${vn(m.Lpath)} mm  footprint Ø=${vn(m.footprintD)} mm  miniaturisation=${vn(m.miniaturize)}x`,
    edgeFed
      ? `' Feed: closed loop + ${vn(m.feedWidth)} mm microstrip to the board edge`
        + `, port referenced to ground (Z0=${vn(Zin)} Ω)`
      : `' Feed: balanced delta-gap source across a ${vn(m.feedGap)} mm break in the loop`,
    "'",
    "' The trace is NOT a frozen point list: the history entry 'define serpentine",
    "' trace' re-evaluates the curve from the parameters below on every rebuild,",
    "' so these are true Parameter Sweep / Optimizer variables.",
    "'",
    "' --- Suggested sweeps (Simulation > Parameter Sweep) ---",
    `'   serp_R     : ${vn(0.9 * R)} .. ${vn(1.1 * R)}   (resonant frequency — the primary tuning knob)`,
    `'   amp_ratio  : ${vn(Math.max(0.02, 0.5 * ampRatio))} .. ${vn(1.5 * ampRatio)}   (undulation depth — miniaturisation vs. radiation efficiency)`,
    `'   serp_ratio : 0 .. ${vn(Math.max(0.1, 2 * serpRatio))}   (kink/skew — extra path length per undulation)`,
    `'   trace_w    : ${vn(0.5 * w)} .. ${vn(2 * w)}   (Q and bandwidth; watch the self-overlap limit)`,
    edgeFed
      ? `'   feed_w     : ${vn(0.5 * num(m.feedWidth))} .. ${vn(1.5 * num(m.feedWidth))}   (line impedance — ${vn(m.feedWidth)} mm is 50 Ω here)`
      : `'   feed_gap   : ${vn(0.4 * (num(m.feedGap) || 1))} .. ${vn(2 * (num(m.feedGap) || 1))}   (input match)`,
    `'   serp_n     : 4 .. ${vn(Math.max(6, num(m.n)))}   (integer only — re-solve R after changing it)`,
    "'",
    "' NOTE: serp_R is synthesized for the f0 above. Changing amp_ratio, serp_ratio",
    "' or serp_n alters the path length G and therefore detunes f0 — re-run EM-1D",
    "' for a re-synthesized serp_R rather than sweeping shape and expecting f0 to hold.",
  ];
  for (const wn of warnings) header.push(`' WARNING: ${String(wn).replace(/[\r\n]+/g, ' ')}`);
  header.push("' ============================================================");

  const L = [];
  L.push('Option Explicit');
  L.push('Sub Main');
  L.push('Dim h As String');
  L.push('');
  L.push('On Error Resume Next');
  L.push('Port.Delete "1"');
  L.push(`Monitor.Delete "farfield (f=${fLabel})"`);
  L.push(`Monitor.Delete "e-field (f=${fLabel})"`);
  L.push('Component.Delete "component1"');
  L.push(`Material.Delete "${cond}"`);
  if (embedded) L.push('Curve.DeleteCurve "serpcurve"');
  if (hasSub) L.push('Material.Delete "Substrate Material"');
  L.push('On Error GoTo 0');
  L.push('');

  L.push('With Units');
  L.push('  .Geometry "mm" : .Frequency "GHz" : .Time "ns"');
  L.push('End With');
  L.push('');

  L.push("' ---- Parameters (defaults = EM-1D synthesized design) ----");
  const P = (n, v) => L.push(`StoreDoubleParameter "${n}", ${vn(v)}`);
  const PS = (n, e) => L.push(`StoreParameter       "${n}", "${e}"`);
  P('f0', f0); P('fmin', 0.6 * f0); P('fmax', 1.6 * f0); P('z0', Zin);
  P('serp_R', R); P('amp_ratio', ampRatio); P('serp_ratio', serpRatio);
  P('serp_n', num(m.n)); P('trace_w', w);
  if (edgeFed) { P('feed_w', num(m.feedWidth)); P('feed_len', Math.max(5, 4 * h)); }
  else P('feed_gap', num(m.feedGap));
  if (embedded) {
    P('chan_r', num(m.channelDia) / 2);
    P('z_amp', num(m.zAmp));      // out-of-plane strain-compensation amplitude
    P('z_cyc', num(m.zCycles));
  }
  P('met_t', t); P('sub_h', embedded ? num(m.slabZ) || h : h);
  if (hasSub) { P('eps_r', er); P('tand', design.lossTangent); }
  if (grounded) P('gnd_t', t);
  // Vacuum padding to the absorbing boundary. An `open` boundary only absorbs in
  // the far field; flush against the structure it sits in the reactive near field
  // and CST rejects it ("must be at least three mesh steps" from the port).
  PS('bg_space', '299.792458 / f0 / 4');   // lambda0/4 in mm (c in mm*GHz)
  // Derived — visible in the Parameter List and used by the board bricks.
  PS('serp_A', 'serp_R * amp_ratio');
  PS('serp_S', 'serp_R * serp_ratio');
  PS('outer_r', 'serp_R + serp_A');
  PS('sub_x', edgeFed ? 'outer_r + trace_w/2 + feed_len'
    : embedded ? 'outer_r + chan_r + 3*sub_h' : 'outer_r + trace_w/2 + 3*sub_h');
  PS('sub_y', 'sub_x');
  L.push('');

  L.push(hist(`define material ${cond}`, embedded
    // EGaIn: sigma 3.4e6 S/m (~17x worse than copper), density 6250 kg/m3.
    ? ['With Material', '.Reset', '.Name "EGaIn"', '.FrqType "all"', '.Type "Lossy metal"',
      '.SetMaterialUnit "GHz","mm"', '.Mu "1.0"', '.Kappa "3.4e+006"', '.Rho "6250.0"',
      '.Colour "0.91","0.89","0.86"', '.Create', 'End With']
    : ['With Material', '.Reset', '.Name "Copper (annealed)"', '.FrqType "all"', '.Type "Lossy metal"',
      '.SetMaterialUnit "GHz","mm"', '.Mu "1.0"', '.Kappa "5.8e+007"', '.Rho "8930.0"',
      '.Colour "1","1","0"', '.Create', 'End With']));
  if (hasSub) {
    L.push(hist('define material Substrate Material', [
      'With Material', '.Reset', '.Name "Substrate Material"', '.FrqType "all"', '.Type "Normal"',
      '.SetMaterialUnit "GHz","mm"', '.Epsilon "eps_r"', '.Mu "1.0"', '.Kappa "0.0"', '.TanD "tand"',
      '.TanDFreq "10.0"', '.TanDGiven "True"', '.TanDModel "ConstTanD"', '.Colour "0.94","0.82","0.76"',
      '.Create', 'End With']));
  }
  L.push(hist('new component component1', ['Component.New "component1"']));
  L.push('');

  // Board: substrate top at z=0 so the trace extrudes 0..met_t (matches the IR).
  if (hasSub) {
    L.push(hist('define brick Substrate', [
      'With Brick', '.Reset', '.Name "Substrate"', '.Component "component1"', '.Material "Substrate Material"',
      '.Xrange "-sub_x", "sub_x"', '.Yrange "-sub_y", "sub_y"',
      embedded ? '.Zrange "-sub_h/2", "sub_h/2"' : '.Zrange "-sub_h", "0"', '.Create', 'End With']));
  }
  if (grounded) {
    L.push(hist('define brick Ground', [
      'With Brick', '.Reset', '.Name "Ground"', '.Component "component1"', '.Material "Copper (annealed)"',
      '.Xrange "-sub_x", "sub_x"', '.Yrange "-sub_y", "sub_y"', '.Zrange "-sub_h - gnd_t", "-sub_h"',
      '.Create', 'End With']));
  }
  L.push(embedded
    ? hist('define embedded channel', serpChannelBlock())
    : hist('define serpentine trace', serpTraceBlock(cond, edgeFed)));
  if (edgeFed) {
    // 50 Ω line from the loop out to the board edge. It starts at x = serp_R
    // because serpPoint(0) = (R, 0) lies exactly on the centreline, so the stub
    // is guaranteed to bond to the conductor for any n / amp_ratio / serp_ratio.
    L.push(hist('define brick Feed', [
      'With Brick', '.Reset', '.Name "Feed"', '.Component "component1"', '.Material "Copper (annealed)"',
      '.Xrange "serp_R", "sub_x"', '.Yrange "-feed_w/2", "feed_w/2"', '.Zrange "0", "met_t"',
      '.Create', 'End With']));
    L.push(hist('boolean add Feed', ['Solid.Add "component1:Serpentine", "component1:Feed"']));
  }
  L.push('');

  L.push(hist('define frequency range', ['Solver.FrequencyRange "fmin", "fmax"']));
  L.push(hist(`define monitor farfield (f=${fLabel})`, [
    'With Monitor', '.Reset', `.Name "farfield (f=${fLabel})"`, '.Domain "Frequency"', '.FieldType "Farfield"',
    '.MonitorValue "f0"', '.ExportFarfieldSource "False"', '.Create', 'End With']));
  L.push(hist(`define monitor e-field (f=${fLabel})`, [
    'With Monitor', '.Reset', `.Name "e-field (f=${fLabel})"`, '.Dimension "Volume"', '.Domain "Frequency"',
    '.FieldType "Efield"', '.MonitorValue "f0"', '.Create', 'End With']));
  L.push(hist('define discrete port 1',
    embedded ? serpChannelPortBlock() : edgeFed ? serpEdgePortBlock() : serpPortBlock()));
  L.push('');

  L.push(hist('define background', vbaBackgroundSpace('bg_space')));
  L.push('With Boundary');
  L.push('  .Xmin "open" : .Xmax "open" : .Ymin "open" : .Ymax "open" : .Zmin "open" : .Zmax "open"');
  L.push('End With');
  L.push(hist('define mesh settings', [
    'With MeshSettings', '.SetMeshType "Hex"', '.Set "StepsPerWaveNear", "10"', '.Set "StepsPerWaveFar", "10"',
    '.Set "StepsPerBoxNear", "10"', 'End With']));
  L.push(hist('set solver type and mesh creator', [
    'ChangeSolverType "HF Time Domain"', 'Mesh.SetCreator "High Frequency"']));
  L.push(hist('define time domain solver', [
    'With Solver', '.Method "Hexahedral"', '.CalculationType "TD-S"', '.StimulationPort "All"',
    '.StimulationMode "All"', '.SteadyStateLimit "-40"', '.MeshAdaption "False"', '.AutoNormImpedance "True"',
    '.NormingImpedance "z0"', 'End With']));
  L.push('');
  L.push('End Sub');

  return header.join('\n') + '\n\n' + L.join('\n') + '\n';
}

export function buildVba(result, design) {
  if (result && result.template === 'concentric-ring') return buildVbaConcentricRing(result, design || {});
  // Degraded results carry no geometry — fall through to the generic builder so
  // the macro is still a well-formed (comment-only) Sub Main.
  if (result && result.template === 'serpentine' && (result.geometry || []).length > 0) {
    return buildVbaSerpentine(result, design || {});
  }
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
  body.push('Dim h As String');
  body.push('');

  // Units / global
  body.push('With Units');
  body.push('  .Geometry "mm"');
  body.push('  .Frequency "GHz"');
  body.push('  .Time "ns"');
  body.push('End With');
  body.push('');

  // Named parameters: geometry below is still literal (only the parametric
  // templates emit expression-driven shapes), but the solver/material drivers
  // are swept-and-optimised often enough to be worth naming.
  body.push(`StoreDoubleParameter "fmin", ${vn(fLo)}`);
  body.push(`StoreDoubleParameter "fmax", ${vn(fHi)}`);
  // lambda0/4 at the lowest solved frequency — the widest padding the span needs
  body.push(`StoreDoubleParameter "bg_space", ${vn(fLo > 0 ? 299.792458 / fLo / 4 : 30)}`);
  if (hasSubstrate) {
    body.push(`StoreDoubleParameter "eps_r", ${vn(design.substrateEr)}`);
    body.push(`StoreDoubleParameter "tand", ${vn(design.lossTangent)}`);
  }
  body.push('');

  // Material (substrate) with lossTangent — only when the geometry uses one
  if (hasSubstrate) {
    body.push(hist('define material substrate', [
      'With Material',
      '  .Reset',
      '  .Name "substrate"',
      '  .Type "Normal"',
      '  .Epsilon "eps_r"',
      '  .Mu 1.0',
      '  .TanD "tand"',
      '  .TanDGiven "True"',
      '  .TanDModel "ConstTanD"',
      '  .Create',
      'End With']));
    body.push('');
  }
  body.push(hist(`new component ${comp}`, [`Component.New "${comp}"`]));
  body.push('');

  // Every geometric operation goes in via AddToHistory: CST treats the history
  // list as the model definition, so a bare Brick.Create leaves an orphan solid
  // that no parametric update or rebuild can ever touch.
  const push = (label, src) => body.push(hist(label, src));

  let portN = 0;
  geometry.forEach((p, i) => {
    if (!p || !p.shape) return;
    if (p.shape === 'box') {
      push(`define brick box_${i}`, vbaBrick(p, `box_${i}`, comp));
    } else if (p.shape === 'cylinder') {
      push(`define cylinder cyl_${i}`, vbaCylinder(`cyl_${i}`, comp, p.material, p.center, p.axis || 'z', p.radius, 0, p.height));
    } else if (p.shape === 'ring') {
      // outer cylinder minus inner cylinder (Boolean subtract)
      push(`define cylinder ring_${i}_outer`, vbaCylinder(`ring_${i}_outer`, comp, p.material, p.center, 'z', p.rOuter, 0, p.height));
      push(`define cylinder ring_${i}_inner`, vbaCylinder(`ring_${i}_inner`, comp, p.material, p.center, 'z', p.rInner, 0, p.height));
      push(`boolean subtract ring_${i}`, vbaSubtract(comp, `ring_${i}_outer`, `ring_${i}_inner`));
    } else if (p.shape === 'segment') {
      // base disk + Boolean truncation cuts (+ optional slot), each a small rotated brick
      const cz = num(p.center[2]);
      const R = num(p.radius), hh = num(p.height) * 2;
      push(`define cylinder seg_${i}`, vbaCylinder(`seg_${i}`, comp, p.material, p.center, 'z', R, 0, p.height));
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
        push(`define brick ${name}`, vbaBrick(tool, name, comp));
        const rot = vbaRotateZ(comp, name, cut.angleDeg);
        if (rot) push(`transform rotate ${name}`, rot);
        push(`boolean subtract ${name}`, vbaSubtract(comp, `seg_${i}`, name));
      });
      if (p.slot && num(p.slot.lengthMm) > 0) {
        const slotTool = {
          shape: 'box', material: p.material,
          center: [0, 0, cz],
          size: { x: num(p.slot.widthMm), y: num(p.slot.lengthMm), z: hh },
        };
        const name = `seg_${i}_slot`;
        push(`define brick ${name}`, vbaBrick(slotTool, name, comp));
        const rot = vbaRotateZ(comp, name, p.slot.angleDeg);
        if (rot) push(`transform rotate ${name}`, rot);
        push(`boolean subtract ${name}`, vbaSubtract(comp, `seg_${i}`, name));
      }
    } else if (p.shape === 'trace') {
      push(`define extrude trace_${i}`, vbaExtrudePolygon(`trace_${i}`, comp, p.material, p.outline, num(p.center[2]) - num(p.thickness) / 2, p.thickness));
    } else if (p.shape === 'feed') {
      portN += 1;
      push(`define discrete port ${portN}`, vbaDiscretePort(p, portN));
    }
    body.push('');
  });

  // Boundaries + solver span
  body.push(hist('define background', vbaBackgroundSpace('bg_space')));
  body.push('With Boundary');
  body.push('  .Xmin "open" : .Xmax "open"');
  body.push('  .Ymin "open" : .Ymax "open"');
  body.push('  .Zmin "open" : .Zmax "open"');
  body.push('End With');
  body.push('');
  body.push(hist('define frequency range', ['Solver.FrequencyRange "fmin", "fmax"']));
  body.push('');
  body.push('End Sub');

  return header.join('\n') + '\n\n' + body.join('\n') + '\n';
}
