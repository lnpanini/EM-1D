import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/physics.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);

// ---------------------------------------------------------------------------
// Task 1: numerical core
// ---------------------------------------------------------------------------
test('sine/cosine integrals', () => {
  close(P.Si(Math.PI / 2), 1.37076, 1e-4);
  close(P.Si(Math.PI), 1.85194, 1e-4);
  close(P.Ci(1), 0.33740, 1e-4);
  close(P.Ci(2), 0.42298, 1e-4);
  close(P.Cin(2 * Math.PI), 2.43765, 1e-4);
});

test('bessel J', () => {
  close(P.besselJ0(0), 1, 1e-12);
  close(P.besselJ0(2.40483), 0, 1e-5);
  close(P.besselJ1(1.84118), 0.581865, 1e-5);
  close(P.besselJ2(3), 0.486091, 1e-5);
});

test('neumann Y', () => {
  close(P.neumannY0(1), 0.088257, 1e-5);
  close(P.neumannY1(1), -0.781213, 1e-5);
  close(P.neumannY0(2), 0.510376, 1e-5);
  close(P.neumannY1(2), -0.107032, 1e-5);
});

// ---------------------------------------------------------------------------
// Task 2: rectangular patch
// ---------------------------------------------------------------------------
test('rect patch FR4 2.4GHz', () => {
  const r = P.rectPatch({ frequencyGHz: 2.4, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, conductorThicknessMm: 0.035, portImpedance: 50 });
  close(r.metrics.W, 38.010, 0.05);
  close(r.metrics.eeff0, 4.0431, 0.01);
  close(r.metrics.eeffF, 4.0498, 0.01);
  close(r.metrics.deltaL, 0.737, 0.01);
  close(r.metrics.L, 29.56, 0.2);
  close(r.metrics.G1, 9.69285e-4, 1e-6);
  // I12 evaluated at the corrected resonant length L (self-consistent with metrics.L)
  close(r.metrics.G12, 5.8283e-4, 2e-6);
  close(r.metrics.Rin0, 322.14, 2);
  assert.ok(r.geometry.length >= 4);
});

// ---------------------------------------------------------------------------
// Task 3: dipole
// ---------------------------------------------------------------------------
test('dipole impedance + resonance', () => {
  const lam = P.C_MM_PER_NS / 0.3; // 300 MHz -> 999.3 mm
  const z = P.dipoleImpedance(0.5 * lam, 1e-4 * lam, lam);
  close(z.R, 73.08, 0.5);
  close(z.X, 42.52, 0.5);
  const r = P.dipole({ frequencyGHz: 0.3, wireRadiusMm: 1, feedGapMm: 1 });
  close(r.metrics.resonantLengthRatio, 0.4775, 0.005);
  close(r.metrics.R, 63.98, 1);
  close(Math.abs(r.metrics.X), 0, 1);
});

// ---------------------------------------------------------------------------
// Task 4: monopole
// ---------------------------------------------------------------------------
test('monopole = half dipole', () => {
  const r = P.monopole({ frequencyGHz: 0.3, wireRadiusMm: 1, groundLengthMm: 500, groundWidthMm: 500, feedGapMm: 1 });
  close(r.metrics.R, 31.99, 0.5);
  close(Math.abs(r.metrics.X), 0, 1);
});

// ---------------------------------------------------------------------------
// Task 5: circular disk
// ---------------------------------------------------------------------------
test('circular disk FR4 2.4GHz', () => {
  const r = P.circularDisk({ frequencyGHz: 2.4, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, portImpedance: 50 });
  close(r.metrics.a, 16.945, 0.05);
  close(r.metrics.ae, 17.467, 0.05);
  close(r.metrics.frCheck, 2.3984, 0.005);
  close(r.metrics.Grad, 1.5757e-3, 1e-5);
  close(r.metrics.Redge, 240.29, 2);
  close(r.metrics.probeRho0, 5.233, 0.05);
  assert.equal(r.metrics.matchable, true);
});

// ---------------------------------------------------------------------------
// Task 6: annular ring
// ---------------------------------------------------------------------------
test('annular ring rho=2', () => {
  close(P.annularRoot(2), 0.677336, 1e-4);
  const r = P.annularRing({ frequencyGHz: 2.4, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, ringRatio: 2, portImpedance: 50 });
  close(r.metrics.a, 6.458, 0.02);
  close(r.metrics.b, 12.916, 0.02);
  close(r.metrics.b / r.metrics.a, 2.0, 1e-3);
});

// ---------------------------------------------------------------------------
// Task 7: CP circular
// ---------------------------------------------------------------------------
test('CP circular perturbation', () => {
  const r = P.cpCircular({ frequencyGHz: 2.4, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, polarization: 'RHCP', portImpedance: 50 });
  close(r.metrics.deltaSratio, 1 / (2 * r.metrics.Qt), 1e-6);
  assert.ok(r.metrics.f1 < r.metrics.f2);
  close((r.metrics.f2 - r.metrics.f1) / r.metrics.f0, 1 / r.metrics.Qt, 1e-3);
  assert.ok(r.metrics.truncationDepth > 0 && r.metrics.slotLength > 0);
  close(r.metrics.feedAngleDeg, 45, 1e-9);
  close(r.metrics.arBandwidthPct, (0.348 / r.metrics.Qt) * 100, 1e-9);
  // §9 verified reference point: the perturbation formulas at Q=50, a=17mm
  const Q = 50, a = 17;
  close(a * Math.pow(3 * Math.PI / (16 * Math.SQRT2 * Q), 2 / 3), 0.699, 0.01);
  close(a * Math.sqrt(Math.PI / (2 * 0.1 * Q)), 9.529, 0.01);
});

// ---------------------------------------------------------------------------
// Task 8: UWB disc monopole
// ---------------------------------------------------------------------------
test('UWB disc monopole', () => {
  const r = P.discMonopoleUWB({ lowerCutoffGHz: 3.1, feedGapMm: 0.3, groundLengthMm: 30, groundWidthMm: 40 });
  close(r.metrics.discRadius, 7.642, 0.01);
  close(r.metrics.reqRadius, 3.821, 0.01);
  close(r.metrics.fLcheck, 3.100, 0.001);
});

// ---------------------------------------------------------------------------
// Task 9: synthesize dispatcher + buildVba
// ---------------------------------------------------------------------------
const ALL = ['rect', 'dipole', 'monopole', 'disk', 'annular', 'cp', 'uwb', 'serp'];

test('synthesize all types robust', () => {
  for (const t of ALL) {
    const base = {
      frequencyGHz: 2.4, lowerCutoffGHz: 3.1, substrateEr: 4.4, substrateHeightMm: 1.6,
      lossTangent: 0.02, conductorThicknessMm: 0.035, wireRadiusMm: 0.75,
      groundLengthMm: 90, groundWidthMm: 90, feedGapMm: 1, portImpedance: 50,
      ringRatio: 2, polarization: 'RHCP',
    };
    const r = P.synthesize(t, base);
    assert.ok(r.geometry.length > 0);
    for (const v of Object.values(r.metrics)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
    const vba = P.buildVba(r, base);
    assert.doesNotMatch(vba, /NaN|Infinity|undefined/);
    assert.match(vba, /Sub Main[\s\S]*End Sub/);
  }
});

test('synthesize blank freq degrades', () => {
  const r = P.synthesize('rect', { frequencyGHz: 0, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, portImpedance: 50 });
  for (const v of Object.values(r.metrics)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
  const vba = P.buildVba(r, { frequencyGHz: 0, substrateEr: 4.4, lossTangent: 0.02 });
  assert.doesNotMatch(vba, /NaN|Infinity|undefined/);
});

test('TYPES exports 8 entries', () => {
  assert.equal(P.TYPES.length, 8);
  for (const t of P.TYPES) { assert.ok(t.key); assert.ok(t.label); }
});

// ---------------------------------------------------------------------------
// Robustness: invalid input domains must WARN, not emit silent garbage
// ---------------------------------------------------------------------------
test('invalid domains warn with empty geometry, no garbage VBA', () => {
  const cases = [
    ['disk', { frequencyGHz: 2.4, substrateEr: 0.5, substrateHeightMm: 1.6 }],   // er < 1
    ['rect', { frequencyGHz: 2.4, substrateEr: 4.4, substrateHeightMm: 0 }],      // h <= 0
    ['annular', { frequencyGHz: 2.4, substrateEr: 4.4, substrateHeightMm: 1.6, ringRatio: 1 }], // ratio <= 1
  ];
  for (const [type, d] of cases) {
    const r = P.synthesize(type, d);
    assert.ok(r.warnings.length > 0, `${type} should warn`);
    assert.equal(r.geometry.length, 0, `${type} should emit no geometry`);
    assert.doesNotMatch(P.buildVba(r, d), /NaN|Infinity|undefined/);
  }
});

test('CP propagates non-matchable warning from disk', () => {
  const r = P.synthesize('cp', { frequencyGHz: 2.4, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, portImpedance: 99999, polarization: 'RHCP' });
  assert.ok(r.warnings.some((w) => /matchable/i.test(w)), 'CP should warn when port exceeds edge resistance');
});

test('buildVba uses CST built-in PEC, never lowercase pec', () => {
  for (const t of ['rect', 'dipole', 'disk', 'annular', 'cp', 'uwb']) {
    const base = {
      frequencyGHz: 2.4, lowerCutoffGHz: 3.1, substrateEr: 4.4, substrateHeightMm: 1.6,
      lossTangent: 0.02, conductorThicknessMm: 0.035, wireRadiusMm: 0.75,
      groundLengthMm: 90, groundWidthMm: 90, feedGapMm: 1, portImpedance: 50,
      ringRatio: 2, polarization: 'RHCP',
    };
    const vba = P.buildVba(P.synthesize(t, base), base);
    assert.doesNotMatch(vba, /\.Material "pec"/, `${t} must not emit lowercase pec`);
    assert.match(vba, /"PEC"/, `${t} should reference built-in PEC`);
  }
});

// ---------------------------------------------------------------------------
// Task 8: serpentine loop
// ---------------------------------------------------------------------------
test('serpentine shape factor: plain circle = 2π; kink adds length', () => {
  close(P.serpShapeFactor(10, 0, 0), 2 * Math.PI, 1e-4);
  close(P.serpShapeFactor(25, 0.2, 0.05), 25.2668, 1e-3);
  close(P.serpShapeFactor(25, 0.2, 0), 21.4111, 1e-3);
});

test('serpentine loop: grounded FR-4 default sizing', () => {
  const r = P.serpentineLoop({ frequencyGHz: 2.45, undulations: 25, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1.0, portImpedance: 50, groundPlane: 'Full' });
  close(r.metrics.eeff, 3.0782, 1e-3);
  close(r.metrics.R, 2.7603, 1e-2);
  close(r.metrics.footprintD, 7.6247, 2e-2);
  close(r.metrics.meander, 4.0213, 1e-2);
  close(r.metrics.Lpath, r.metrics.lamg, 1e-6);   // 1λ solve self-check
  assert.equal(r.metrics.Rrad, null);              // grounded → radiation estimate withheld
});

test('serpentine loop: no-ground and air re-size larger', () => {
  const base = { frequencyGHz: 2.45, undulations: 25, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1.0, portImpedance: 50 };
  const none = P.serpentineLoop({ ...base, groundPlane: 'None' });
  close(none.metrics.eeff, 2.70, 1e-3);
  close(none.metrics.R, 2.9473, 1e-2);
  close(none.metrics.footprintD, 8.0735, 2e-2);
  assert.equal(none.metrics.Rrad, 100);
  const air = P.serpentineLoop({ ...base, substrateEr: 1, groundPlane: 'None' });
  close(air.metrics.eeff, 1, 1e-9);
  close(air.metrics.R, 4.8429, 1e-2);
});

test('serpentine loop geometry: trace + feed, substrate/ground per config', () => {
  const full = P.serpentineLoop({ frequencyGHz: 2.45, undulations: 25, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1, portImpedance: 50, groundPlane: 'Full' });
  const shapes = full.geometry.map((p) => p.shape);
  assert.equal(shapes.filter((k) => k === 'trace').length, 1);
  assert.ok(full.geometry.some((p) => p.shape === 'feed'));
  assert.ok(full.geometry.some((p) => p.material === 'substrate'));
  assert.ok(full.geometry.some((p) => p.shape === 'box' && p.material === 'pec')); // ground
  const trace = full.geometry.find((p) => p.shape === 'trace');
  assert.ok(trace.outline.length >= 1440 && trace.outline.length % 2 === 0);
  for (const pt of trace.outline) assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
  const none = P.serpentineLoop({ frequencyGHz: 2.45, undulations: 25, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 1, substrateHeightMm: 1.6, feedGapMm: 1, portImpedance: 50, groundPlane: 'None' });
  assert.ok(!none.geometry.some((p) => p.material === 'substrate')); // air → no dielectric slab
  assert.ok(!none.geometry.some((p) => p.shape === 'box' && p.material === 'pec')); // no ground
});

test('serpentine loop: buildable default (n=12) is clean; dense n self-overlaps', () => {
  const mk = (n) => P.serpentineLoop({ frequencyGHz: 2.45, undulations: n, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1, portImpedance: 50, groundPlane: 'Full' });
  assert.ok(!mk(12).warnings.some((w) => /self-overlap/.test(w)), 'n=12 default does not self-overlap');
  assert.ok(mk(25).warnings.some((w) => /self-overlap/.test(w)), 'n=25 self-overlaps at 2.45 GHz');
  assert.ok(mk(14).warnings.some((w) => /self-overlap/.test(w)), 'n=14 self-overlaps (heuristic checks closest approach)');
});

// ---------------------------------------------------------------------------
// Task 2: register serp in dispatcher
// ---------------------------------------------------------------------------
test('serp is registered in TYPES', () => {
  assert.ok(P.TYPES.some((t) => t.key === 'serp' && /serpentine/i.test(t.label)));
});

test('serpentine loop: synthesize + graceful degradation', () => {
  const good = P.synthesize('serp', { type: 'serp', frequencyGHz: 2.45, undulations: 25, ampRatio: 0.20,
    serpRatio: 0.05, traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1, portImpedance: 50, groundPlane: 'Full' });
  assert.ok(good.geometry.length >= 3);
  for (const k in good.metrics) { const v = good.metrics[k]; if (typeof v === 'number') assert.ok(Number.isFinite(v), k); }
  // n < 4 → coerced with a warning, still finite geometry
  const bad = P.synthesize('serp', { type: 'serp', frequencyGHz: 2.45, undulations: 1, ampRatio: 0.20,
    serpRatio: 0.05, traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1, portImpedance: 50 });
  assert.ok(bad.geometry.length >= 1);
  assert.ok(bad.warnings.some((w) => /coerced/.test(w)), 'n<4 coercion warning present');
  // missing frequency → clean empty result
  const nofreq = P.synthesize('serp', { type: 'serp', undulations: 25, ampRatio: 0.2, serpRatio: 0.05, substrateEr: 4.4, substrateHeightMm: 1.6 });
  assert.equal(nofreq.geometry.length, 0);
});

test('serpentine loop VBA: extruded polygon + port + substrate', () => {
  const design = { type: 'serp', frequencyGHz: 2.45, undulations: 25, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, feedGapMm: 1, portImpedance: 50, groundPlane: 'Full' };
  const r = P.synthesize('serp', design);
  const vba = P.buildVba(r, design);
  assert.match(vba, /With Extrude/);
  assert.match(vba, /\.Mode "Pointlist"/);
  assert.match(vba, /With DiscretePort/);
  assert.match(vba, /\.Name "substrate"/);          // grounded FR-4 emits the dielectric material
  assert.doesNotMatch(vba, /NaN|Infinity|undefined/);
});
