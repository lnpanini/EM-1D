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

test('annular is a concentric N-ring parametric export', () => {
  const base = {
    type: 'annular', frequencyGHz: 2.45, substrateEr: 3.66, substrateHeightMm: 0.762,
    lossTangent: 0.0037, ringRatio: 2, feedWidthMm: 1, portImpedance: 50,
  };
  // default two rings + connector + feed strip + edge port
  const r2 = P.synthesize('annular', { ...base, ringCount: 2, ringGapMm: 1, innerRingWidthMm: 2.5 });
  assert.equal(r2.metrics.ringCount, 2, 'two rings');
  assert.equal(r2.geometry.filter((g) => g.shape === 'ring').length, 2, 'two ring solids');
  assert.ok(r2.geometry.some((g) => g.shape === 'feed'), 'has an edge feed port');
  assert.ok(r2.metrics.innermostRadius > 0, 'innermost radius stays positive');
  close(r2.metrics.gap, 1, 1e-9);
  const v2 = P.buildVba(r2, { ...base, ringCount: 2 });
  assert.match(v2, /StoreDoubleParameter "r_out_o"/, 'defines outer-radius parameter');
  assert.match(v2, /StoreParameter\s+"r1_o", "r_out_i - gap"/, 'derives ring 1 from gap');
  assert.match(v2, /Parameter Sweep/, 'lists suggested sweep ranges');
  assert.match(v2, /"Copper \(annealed\)"/, 'uses lossy copper');
  assert.doesNotMatch(v2, /\.Material "pec"/, 'never lowercase pec');
  assert.doesNotMatch(v2, /"Ring 2"/, 'only two rings -> no Ring 2');
  assert.match(v2, /Sub Main[\s\S]*End Sub/);
  assert.doesNotMatch(v2, /NaN|Infinity|undefined/);

  // three rings with tighter spacing so they all fit
  const r3 = P.synthesize('annular', { ...base, ringCount: 3, ringGapMm: 0.5, innerRingWidthMm: 1.0 });
  assert.equal(r3.metrics.ringCount, 3, 'three rings fit');
  assert.equal(r3.geometry.filter((g) => g.shape === 'ring').length, 3);
  const v3 = P.buildVba(r3, { ...base, ringCount: 3 });
  assert.match(v3, /define cylinder Ring 2/, 'third ring emitted');
  assert.match(v3, /boolean add Connect 1/, 'second connector unioned');
  assert.doesNotMatch(v3, /NaN|Infinity|undefined/);

  // requesting more rings than fit collapses gracefully with a warning
  const rMax = P.synthesize('annular', { ...base, ringCount: 5, ringGapMm: 2, innerRingWidthMm: 3 });
  assert.ok(rMax.metrics.ringCount < 5, 'excess rings dropped');
  assert.ok(rMax.warnings.some((w) => /rings fit/.test(w)), 'warns when rings do not fit');
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
  // annular is excluded: its parametric export uses lossy "Copper (annealed)"
  // instead of PEC (see the concentric-ring test below).
  for (const t of ['rect', 'dipole', 'disk', 'cp', 'uwb']) {
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
  // grounded → closed loop, so the trace is an annulus: outer outline + inner hole
  assert.equal(full.metrics.feedType, 'microstrip-edge');
  assert.ok(trace.inner, 'closed loop carries a hole boundary');
  assert.equal(trace.outline.length, trace.inner.length, 'both rings sample identically');
  assert.ok(trace.outline.length >= 720, 'outline stays dense');
  for (const pt of [...trace.outline, ...trace.inner]) assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
  const none = P.serpentineLoop({ frequencyGHz: 2.45, undulations: 25, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 1, substrateHeightMm: 1.6, feedGapMm: 1, portImpedance: 50, groundPlane: 'None' });
  assert.ok(!none.geometry.some((p) => p.material === 'substrate')); // air → no dielectric slab
  assert.ok(!none.geometry.some((p) => p.shape === 'box' && p.material === 'pec')); // no ground
  // ungrounded → free-standing loop, delta-gap feed, open ribbon (no hole)
  assert.equal(none.metrics.feedType, 'delta-gap');
  const openTrace = none.geometry.find((p) => p.shape === 'trace');
  assert.ok(!openTrace.inner, 'open ribbon is a simple polygon');
  assert.ok(openTrace.outline.length >= 1440 && openTrace.outline.length % 2 === 0);
});

// The ground plane decides the antenna, and therefore the feed: a free-standing
// loop takes a balanced delta-gap source, but over a ground plane the structure
// is microstrip and the ground IS the port's return conductor.
test('feed topology follows the ground plane', () => {
  const mk = (groundPlane) => P.serpentineLoop({ frequencyGHz: 2.45, undulations: 12, ampRatio: 0.20,
    serpRatio: 0.05, traceWidthMm: 0.8, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1,
    portImpedance: 50, conductorThicknessMm: 0.035, groundPlane });

  const gnd = mk('Full');
  assert.equal(gnd.metrics.feedType, 'microstrip-edge');
  close(gnd.metrics.feedWidth, P.microstripWidth(50, 4.4, 1.6), 1e-12);
  assert.equal(gnd.metrics.feedGap, 0, 'closed loop has no gap');
  // the port must straddle trace and ground, not float in the trace plane
  const port = gnd.geometry.find((p) => p.shape === 'feed');
  assert.ok(port.p1[2] > 0, 'top terminal on the conductor');
  assert.ok(port.p2[2] < -1.6, 'bottom terminal on the ground plane');
  close(port.p1[0], port.p2[0], 1e-12);   // vertical launch at the board edge
  // a feed line reaches that edge
  const line = gnd.geometry.find((p) => p.shape === 'box' && p.material === 'pec' && p.size.y < 10);
  assert.ok(line, 'microstrip feed line present');
  close(line.center[0] + line.size.x / 2, port.p1[0], 1e-9);
  // and it starts at x=R, the one point guaranteed to lie on the centreline
  close(line.center[0] - line.size.x / 2, gnd.metrics.R, 1e-9);

  const air = mk('None');
  assert.equal(air.metrics.feedType, 'delta-gap');
  assert.equal(air.metrics.feedWidth, null);
  const dg = air.geometry.find((p) => p.shape === 'feed');
  close(dg.p1[2], dg.p2[2], 1e-12);       // both terminals in the conductor plane
  assert.ok(!air.geometry.some((p) => p.shape === 'box' && p.material === 'pec'), 'no ground, no feed line');
});

test('serpentine loop: buildable default (n=12) is clean; dense n self-overlaps', () => {
  const mk = (n) => P.serpentineLoop({ frequencyGHz: 2.45, undulations: n, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 1, portImpedance: 50, groundPlane: 'Full' });
  assert.ok(!mk(12).warnings.some((w) => /self-overlap/.test(w)), 'n=12 default does not self-overlap');
  assert.ok(mk(25).warnings.some((w) => /self-overlap/.test(w)), 'n=25 self-overlaps at 2.45 GHz');
  assert.ok(mk(14).warnings.some((w) => /self-overlap/.test(w)), 'n=14 self-overlaps (heuristic checks closest approach)');
});

test('serpentine loop: feed gap smaller than trace width is not a self-overlap; trace sits at mid-plane', () => {
  const r = P.serpentineLoop({ frequencyGHz: 2.45, undulations: 12, ampRatio: 0.20, serpRatio: 0.05,
    traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, feedGapMm: 0.5, portImpedance: 50, groundPlane: 'Full' });
  assert.ok(!r.warnings.some((w) => /self-overlap/.test(w)), 'narrow feed gap must not read as self-overlap');
  const trace = r.geometry.find((p) => p.shape === 'trace');
  close(trace.center[2], trace.thickness / 2, 1e-12);   // conductor mid-plane
  // VBA still extrudes from z=0 (origin = center[2] - thickness/2)
  const vba = P.buildVba(r, { type: 'serp', frequencyGHz: 2.45, substrateEr: 4.4, lossTangent: 0.02 });
  assert.match(vba, /\.Origin 0, 0, 0/);
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

const SERP_DESIGN = { type: 'serp', frequencyGHz: 2.45, undulations: 12, ampRatio: 0.20, serpRatio: 0.05,
  traceWidthMm: 1.0, substrateEr: 4.4, substrateHeightMm: 1.6, lossTangent: 0.02, conductorThicknessMm: 0.035,
  feedGapMm: 1, portImpedance: 50, groundPlane: 'Full' };

test('serpentine loop VBA: extruded polygon + port + substrate', () => {
  const vba = P.buildVba(P.synthesize('serp', SERP_DESIGN), SERP_DESIGN);
  // history blocks escape inner quotes VBA-style ("" inside a string literal)
  assert.match(vba, /With Extrude/);
  assert.match(vba, /\.Mode ""Pointlist""/);
  assert.match(vba, /With DiscretePort/);
  assert.match(vba, /\.Name ""Substrate Material""/);   // grounded FR-4 emits the dielectric
  assert.match(vba, /\.Name ""Ground""/);
  assert.doesNotMatch(vba, /NaN|Infinity|undefined/);
});

// ---------------------------------------------------------------------------
// CST macro-validity guards
// ---------------------------------------------------------------------------
const EXPORT_TYPES = [
  ['rect', {}], ['dipole', {}], ['monopole', {}], ['disk', {}], ['annular', {}],
  ['cp', {}], ['uwb', {}], ['serp', {}],
];
const EXPORT_BASE = {
  frequencyGHz: 2.4, lowerCutoffGHz: 3.1, substrateEr: 4.4, substrateHeightMm: 1.6,
  lossTangent: 0.02, conductorThicknessMm: 0.035, wireRadiusMm: 0.75,
  groundLengthMm: 90, groundWidthMm: 90, feedGapMm: 1, portImpedance: 50,
  ringRatio: 2, polarization: 'RHCP', undulations: 12, ampRatio: 0.2,
  serpRatio: 0.05, traceWidthMm: 1.0, groundPlane: 'Full',
};

// CST rejects the legacy Point1/Point2/UsePickedPoints API alongside SetP1/SetP2
// with "(&H8000ffff) do not mix old ... with new ... commands", aborting the macro
// mid-run — which silently leaves the model without its port.
test('no export mixes the legacy and modern DiscretePort point APIs', () => {
  for (const [t, over] of EXPORT_TYPES) {
    const d = { ...EXPORT_BASE, ...over, type: t };
    const vba = P.buildVba(P.synthesize(t, d), d);
    if (!/DiscretePort/.test(vba)) continue;
    assert.doesNotMatch(vba, /UsePickedPoints/, `${t} must not emit the legacy UsePickedPoints`);
    assert.doesNotMatch(vba, /\.Point1\b|\.Point2\b/, `${t} must not emit the legacy Point1/Point2`);
    assert.match(vba, /\.SetP1 /, `${t} should place the port with SetP1/SetP2`);
  }
});

// In CST the history list *is* the model: a bare Brick.Create leaves an orphan
// solid that no parametric rebuild can touch.
test('every export routes its geometry through AddToHistory', () => {
  for (const [t, over] of EXPORT_TYPES) {
    const d = { ...EXPORT_BASE, ...over, type: t };
    const vba = P.buildVba(P.synthesize(t, d), d);
    assert.match(vba, /AddToHistory/, `${t} should record geometry in the history list`);
    // no naked construction call outside a history block
    assert.doesNotMatch(vba, /^\s*With Brick\s*$/m, `${t} builds bricks outside AddToHistory`);
    assert.doesNotMatch(vba, /^\s*With Cylinder\s*$/m, `${t} builds cylinders outside AddToHistory`);
    assert.doesNotMatch(vba, /^\s*With DiscretePort\s*$/m, `${t} builds ports outside AddToHistory`);
  }
});

// VBA caps line-continuations per statement (24 in VBA6); longer blocks must use
// the `h = h & ...` accumulator form instead of `& vbLf & _`.
test('no AddToHistory statement exceeds the VBA line-continuation limit', () => {
  for (const [t, over] of EXPORT_TYPES) {
    const d = { ...EXPORT_BASE, ...over, type: t };
    const vba = P.buildVba(P.synthesize(t, d), d);
    let run = 0;
    for (const line of vba.split('\n')) {
      run = /&\s*_\s*$/.test(line) ? run + 1 : 0;
      assert.ok(run <= 24, `${t}: ${run} continuations in one statement exceeds the VBA limit`);
    }
  }
});

// ---------------------------------------------------------------------------
// Parametric serpentine export
// ---------------------------------------------------------------------------
test('serpentine export drives the trace from named CST parameters', () => {
  const vba = P.buildVba(P.synthesize('serp', SERP_DESIGN), SERP_DESIGN);
  // SERP_DESIGN is grounded, so it is edge-fed: feed_w/feed_len, not feed_gap
  for (const p of ['serp_R', 'amp_ratio', 'serp_ratio', 'serp_n', 'trace_w', 'feed_w', 'feed_len', 'met_t', 'sub_h'])
    assert.match(vba, new RegExp(`StoreDoubleParameter "${p}"`), `${p} must be a named parameter`);
  const air = { ...SERP_DESIGN, groundPlane: 'None' };
  assert.match(P.buildVba(P.synthesize('serp', air), air), /StoreDoubleParameter "feed_gap"/,
    'the delta-gap variant still parameterises its gap');
  for (const p of ['serp_A', 'serp_S', 'outer_r', 'sub_x'])
    assert.match(vba, new RegExp(`StoreParameter\\s+"${p}"`), `${p} must be a derived expression`);
  // the trace block re-reads the drivers rather than baking in a point list
  for (const p of ['serp_R', 'amp_ratio', 'serp_ratio', 'serp_n', 'trace_w'])
    assert.match(vba, new RegExp(`RestoreDoubleParameter\\(""${p}""\\)`), `${p} must be read back at rebuild`);
  // board bricks reference parameters, never literal extents
  assert.match(vba, /\.Xrange ""-sub_x"", ""sub_x""/);
});

test('serpentine export emits a curve generator, not a frozen point list', () => {
  const r = P.synthesize('serp', SERP_DESIGN);
  const vba = P.buildVba(r, SERP_DESIGN);
  const tr = r.geometry.find((p) => p.shape === 'trace');
  const pts = tr.outline.length + (tr.inner ? tr.inner.length : 0);
  assert.ok(pts > 1000, 'IR still carries the dense outline for the 3D view');
  // ...but the macro must be compact: a loop, not ~1450 literal .LineTo lines
  // a frozen point list would be ~1450 lines; a generator keeps it in the hundreds
  assert.ok(vba.split('\n').length < 500, `macro should stay compact, got ${vba.split('\n').length} lines`);
  assert.match(vba, /For i = 0 To Lst/);
  assert.match(vba, /\.LineTo lx\(i\), ly\(i\)/);
  // no literal coordinate ever reaches a LineTo
  assert.doesNotMatch(vba, /\.LineTo -?\d/);
  // closed loop → annulus built as outer minus inner, both from the generator
  assert.match(vba, /\.LineTo rx\(i\), ry\(i\)/);
  assert.match(vba, /Solid\.Subtract ""component1:Serpentine"", ""component1:SerpHole""/);
});

test('serpentine parameter defaults track the synthesized design', () => {
  const lo = P.synthesize('serp', SERP_DESIGN);
  const hiD = { ...SERP_DESIGN, frequencyGHz: 5.8 };
  const hi = P.synthesize('serp', hiD);
  const grab = (vba, name) => Number(new RegExp(`StoreDoubleParameter "${name}", (\\S+)`).exec(vba)[1]);
  const rLo = grab(P.buildVba(lo, SERP_DESIGN), 'serp_R');
  const rHi = grab(P.buildVba(hi, hiD), 'serp_R');
  close(rLo, lo.metrics.R, 1e-9);
  close(rHi, hi.metrics.R, 1e-9);
  assert.ok(rHi < rLo, 'a higher f0 must seed a smaller loop radius');
});

test('serpentine export drops substrate/ground blocks when not configured', () => {
  const d = { ...SERP_DESIGN, substrateEr: 1, groundPlane: 'None' };
  const vba = P.buildVba(P.synthesize('serp', d), d);
  assert.doesNotMatch(vba, /Substrate Material/, 'air design must not define a dielectric');
  assert.doesNotMatch(vba, /""Ground""/, 'ungrounded design must not build a ground plane');
  assert.match(vba, /define serpentine trace/, 'the trace is still built');
});

test('degraded serpentine still emits a well-formed macro', () => {
  const d = { type: 'serp', undulations: 12, ampRatio: 0.2, serpRatio: 0.05, substrateEr: 4.4, substrateHeightMm: 1.6 };
  const r = P.synthesize('serp', d);
  assert.equal(r.geometry.length, 0);
  const vba = P.buildVba(r, d);
  assert.match(vba, /Sub Main[\s\S]*End Sub/);
  assert.doesNotMatch(vba, /NaN|Infinity|undefined/);
});

// An `open` boundary only absorbs in the far field; flush against the structure
// it sits in the reactive near field and CST rejects any port within three mesh
// steps of it ("Distance between discrete port and open boundary is too small").
test('every export pads the open boundary with vacuum space', () => {
  for (const [t, over] of EXPORT_TYPES) {
    const d = { ...EXPORT_BASE, ...over, type: t };
    const vba = P.buildVba(P.synthesize(t, d), d);
    if (!/\.Xmin ""?open/.test(vba)) continue;
    assert.match(vba, /With Background/, `${t} must add background space`);
    for (const f of ['Xmin', 'Xmax', 'Ymin', 'Ymax', 'Zmin', 'Zmax'])
      assert.match(vba, new RegExp(`\\.${f}Space`), `${t} missing ${f} padding`);
    assert.match(vba, /"bg_space"/, `${t} should drive padding from a named parameter`);
  }
});

test('boundary padding is about a quarter wavelength', () => {
  const vba = P.buildVba(P.synthesize('serp', SERP_DESIGN), SERP_DESIGN);
  // parametric templates express it against f0 rather than baking in a number
  assert.match(vba, /StoreParameter\s+"bg_space", "299\.792458 \/ f0 \/ 4"/);
  const d = { ...EXPORT_BASE, type: 'rect' };
  const gen = P.buildVba(P.synthesize('rect', d), d);
  const space = Number(/StoreDoubleParameter "bg_space", (\S+)/.exec(gen)[1]);
  close(space, 299.792458 / (0.7 * 2.4) / 4, 1e-6);
});

// A 50 Ohm line on thick / low-permittivity substrate can exceed the meander
// pitch, bridging adjacent strands and shorting out part of the resonant path.
test('warns when the 50 ohm feed line is wider than the undulation pitch', () => {
  const mk = (over) => P.serpentineLoop({ frequencyGHz: 2.45, undulations: 12, ampRatio: 0.20,
    serpRatio: 0.05, traceWidthMm: 0.8, substrateEr: 4.4, substrateHeightMm: 1.6,
    portImpedance: 50, conductorThicknessMm: 0.035, groundPlane: 'Full', ...over });
  const hit = /wider than the undulation pitch/;

  const thick = mk({});                       // 1.6 mm FR-4 -> 3.06 mm line vs 2.73 mm pitch
  assert.ok(thick.metrics.feedWidth > 2 * Math.PI * thick.metrics.R / thick.metrics.n);
  assert.ok(thick.warnings.some((w) => hit.test(w)), 'should warn on the default FR-4 stack');

  const thin = mk({ substrateHeightMm: 0.2 });  // thinner substrate -> much narrower line
  assert.ok(thin.metrics.feedWidth < 2 * Math.PI * thin.metrics.R / thin.metrics.n);
  assert.ok(!thin.warnings.some((w) => hit.test(w)), 'a thin substrate should clear the pitch');

  // never fires for the ungrounded delta-gap variant, which has no feed line
  assert.ok(!mk({ groundPlane: 'None' }).warnings.some((w) => hit.test(w)));
});

// CST rejects any parameter whose name shadows a VBA or Python keyword/function:
// "Invalid parameter name 'space'." — Space() is a VBA builtin. The macro aborts
// at the StoreParameter line, so nothing downstream is created.
const VBA_RESERVED = `Abs And Array Asc Atn Call Case CBool CByte CDate CDbl Chr CInt CLng Close Const
Cos CreateObject CSng CStr CurDir Date Day Dim Dir Do Double Each Else End Environ EOF Eqv Erase Err
Error Exit Exp False Fix For Format Function Get GoTo Hex Hour If Imp In InStr Int Integer Is IsArray
IsDate IsEmpty IsNull IsNumeric IsObject Join Kill LBound LCase Left Len Let Like Line Load Loc Lock
Lof Log Long Loop LTrim Mid Minute MkDir Mod Month MsgBox New Next Not Nothing Now Null Object Oct On
Open Option Or Print Private Public Put Randomize ReDim Rem Replace Reset Resume Return Right RmDir
Rnd Round RTrim Second Seek Select Set Sgn Shell Sin Single Space Split Sqr Static Stop Str StrComp
String Sub Tab Tan Then Time Timer To Trim True Type UBound UCase Unload Until Val VarType Wend While
With Write Xor Year`.split(/\s+/);
const PY_RESERVED = `abs all and any as assert ascii async await bin bool break bytes callable chr
class compile complex continue def del delattr dict dir divmod elif else enumerate eval except exec
filter finally float for format from frozenset getattr global globals hasattr hash help hex id if
import in input int is isinstance issubclass iter lambda len list locals map max memoryview min next
none nonlocal not object oct open or ord pass pow print property raise range repr return reversed
round set setattr slice sorted staticmethod str sum super try tuple type vars while with yield
zip`.split(/\s+/);
const RESERVED = new Set([...VBA_RESERVED, ...PY_RESERVED].map((s) => s.toLowerCase()));

test('no exported parameter name shadows a VBA or Python builtin', () => {
  for (const [t, over] of EXPORT_TYPES) {
    const d = { ...EXPORT_BASE, ...over, type: t };
    const vba = P.buildVba(P.synthesize(t, d), d);
    const names = [...vba.matchAll(/Store(?:Double)?Parameter\s+"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(names.length, `${t} should define parameters`);
    for (const n of names)
      assert.ok(!RESERVED.has(n.toLowerCase()), `${t}: parameter "${n}" shadows a VBA/Python builtin`);
  }
});

// The earlier width check (outline-to-inner distance == trace_w) passed even with
// the rings swapped, because separation is symmetric. Containment is not: if the
// hole is the larger ring, CST's Solid.Subtract deletes the solid outright and
// only reports it one command later, against a different shape name.
test('closed-loop trace: outline encloses the hole', () => {
  const signedArea = (p) => {
    let a = 0;
    for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; }
    return a / 2;
  };
  const r = P.synthesize('serp', SERP_DESIGN);
  const tr = r.geometry.find((p) => p.shape === 'trace');
  const outer = Math.abs(signedArea(tr.outline)), hole = Math.abs(signedArea(tr.inner));
  assert.ok(outer > hole, `outline (${outer.toFixed(2)}) must enclose the hole (${hole.toFixed(2)})`);
  // the annulus area is the conductor: perimeter x trace width, within a few %
  const approx = r.metrics.Lpath * SERP_DESIGN.traceWidthMm;
  assert.ok(Math.abs((outer - hole) - approx) / approx < 0.05,
    `annulus area ${(outer - hole).toFixed(2)} should be ~L*w = ${approx.toFixed(2)}`);
  // every hole vertex lies nearer the origin than the mean outer radius
  const meanR = (p) => p.reduce((s, q) => s + Math.hypot(q[0], q[1]), 0) / p.length;
  assert.ok(meanR(tr.inner) < meanR(tr.outline), 'hole must sit inside the outline');

  // and the VBA must extrude them in the same order
  const vba = P.buildVba(r, SERP_DESIGN);
  const outerAt = vba.indexOf('.Point rx(0), ry(0)');
  const holeAt = vba.indexOf('.Point lx(0), ly(0)');
  assert.ok(outerAt > -1 && holeAt > -1, 'both rings extruded');
  assert.ok(outerAt < holeAt, 'Serpentine (outer) must be created before SerpHole');
});

// ---------------------------------------------------------------------------
// Embedded liquid-metal channel (PDMS cast + EGaIn injection)
// ---------------------------------------------------------------------------
const LM_DESIGN = { type: 'serp', frequencyGHz: 2.44, substrateEr: 2.68, substrateHeightMm: 1.5,
  lossTangent: 0.02, ampRatio: 0.20, serpRatio: 0.05, undulations: 12, traceWidthMm: 0.8,
  conductorThicknessMm: 0.018, portImpedance: 50, conductorForm: 'Embedded channel',
  channelDiaMm: 0.5, zCycles: 48, maxStrainPct: 20, groundPlane: 'None' };

// A liquid metal has no stiffness, so the channel deforms affinely with the
// elastomer -- an in-plane serpentine buys nothing. Confirm that directly.
test('in-plane serpentine gives no strain benefit over a plain circle', () => {
  const arcRatio = (A_R, S_R) => {
    const R = 1, n = 12, e = 0.2, nu = 0.5;
    const L0 = P.serpArc3D(R, A_R * R, S_R * R, n, 0, 48);
    const L1 = P.serpArc3D(R, A_R * R, S_R * R, n, 0, 48, 1 + e, 1 - nu * e, 1 - nu * e);
    return L1 / L0 - 1;
  };
  const serp = arcRatio(0.20, 0.05), circle = arcRatio(0, 0);
  close(serp, circle, 2e-4);                       // indistinguishable
  assert.ok(serp > 0.05, 'both stretch ~5.5% at 20% strain');
});

// The out-of-plane wave works without any stiffness contrast: Poisson
// compression of z flattens it, releasing arc length as the perimeter grows.
test('out-of-plane wave makes the path length strain-invariant', () => {
  const flat = P.serpZDrift(0, 12, 0.20, 0.05, 48, 0.20);
  const ratio = P.solveSerpZRatio(12, 0.20, 0.05, 48, 0.20);
  const tuned = P.serpZDrift(ratio, 12, 0.20, 0.05, 48, 0.20);
  assert.ok(ratio > 0.15 && ratio < 0.22, `a/lambda should land near 0.18, got ${ratio.toFixed(3)}`);
  assert.ok(tuned < flat / 20, `tuned drift ${(tuned * 100).toFixed(3)}% vs flat ${(flat * 100).toFixed(2)}%`);
  assert.ok(tuned * 100 < 1.71, 'tuned design must hold the BLE band');
});

// The optimum ratio is dimensionless and scale-free, so it must not depend on
// the wave frequency -- that is what lets you pick mz for printer resolution.
test('optimal a/lambda is independent of z-wave frequency', () => {
  const ratios = [24, 36, 48, 72, 96].map((mz) => P.solveSerpZRatio(12, 0.20, 0.05, mz, 0.20));
  const lo = Math.min(...ratios), hi = Math.max(...ratios);
  assert.ok(hi - lo < 0.02, `ratios should agree across mz, spread ${(hi - lo).toFixed(4)}`);
});

test('embedded channel: eeff, sizing and geometry', () => {
  const r = P.synthesize('serp', LM_DESIGN), m = r.metrics;
  // fully buried -> the conductor sees dielectric on every side
  close(m.eeff, 2.68, 1e-12);
  assert.ok(m.embedded);
  // the 3D arc length (not the in-plane path) is what must equal lambda_g
  close(m.Lpath, m.lamg, 1e-2);
  // the z-wave adds arc length, so R shrinks below the flat solution
  assert.ok(m.R < m.lamg / m.G, 'R must shrink to absorb the wave arc length');
  const tube = r.geometry.find((g) => g.shape === 'tube');
  assert.ok(tube, 'embedded channel is a swept tube, not a flat trace');
  close(tube.radius, LM_DESIGN.channelDiaMm / 2, 1e-12);
  assert.ok(tube.path.every((p) => p.length === 3 && p.every(Number.isFinite)));
  assert.ok(tube.path.some((p) => Math.abs(p[2]) > 0.1), 'path must actually undulate in z');
  close(Math.max(...tube.path.map((p) => Math.abs(p[2]))), m.zAmp, 1e-3);
  // slab is centred on z=0 and thick enough to bury the wave envelope
  const slab = r.geometry.find((g) => g.material === 'substrate');
  close(slab.center[2], 0, 1e-12);
  assert.ok(slab.size.z >= LM_DESIGN.channelDiaMm + 2 * m.zAmp, 'slab must enclose the channel');
  // a loop needs no counterpoise: never emit a ground plane here
  assert.ok(!r.geometry.some((g) => g.material === 'pec'), 'no ground plane for an embedded loop');
});

test('embedded channel: EGaIn loss is real but small', () => {
  const m = P.synthesize('serp', LM_DESIGN).metrics;
  assert.ok(m.efficiency > 0.9 && m.efficiency < 1, `efficiency ${m.efficiency}`);
  // the fat channel repays EGaIn's ~17x conductivity penalty
  const cu = P.synthesize('serp', { ...LM_DESIGN, conductorForm: 'Etched trace', groundPlane: 'None' }).metrics;
  assert.ok(m.Rloss > 0 && cu.Rloss > 0);
  assert.ok(m.efficiency > 0.95, 'injected channel should still clear 95%');
});

test('embedded channel: ground plane is refused, with a reason', () => {
  const r = P.synthesize('serp', { ...LM_DESIGN, groundPlane: 'Full' });
  assert.equal(r.metrics.grounded, false);
  assert.ok(r.warnings.some((w) => /counterpoise/.test(w)), 'must explain why the ground was dropped');
});

test('embedded channel VBA: 3D curve wire, not an extrusion', () => {
  const vba = P.buildVba(P.synthesize('serp', LM_DESIGN), LM_DESIGN);
  assert.match(vba, /StoreDoubleParameter "z_amp"/);
  assert.match(vba, /StoreDoubleParameter "z_cyc"/);
  assert.match(vba, /StoreDoubleParameter "chan_r"/);
  assert.match(vba, /Curve\.NewCurve/);
  assert.match(vba, /With Polygon3D/);
  assert.match(vba, /\.Type ""CurveWire""/);
  assert.match(vba, /\.Name ""EGaIn""/);
  assert.match(vba, /zamp \* Sin\(mzz \* tt\)/);      // the z wave is generated, not baked
  assert.doesNotMatch(vba, /With Extrude/, 'a 3D path cannot be an extrusion');
  assert.doesNotMatch(vba, /NaN|Infinity|undefined/);
});
