// Pure unit tests for the geometry-IR → mesh-spec mapping (no THREE, no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesize } from '../src/physics.js';
import { geometryToMeshSpecs, segmentOutline, sceneBounds, materialStyle } from '../src/scene.js';

const base = {
  frequencyGHz: 2.4, lowerCutoffGHz: 3.1, substrateEr: 4.4, substrateHeightMm: 1.6,
  lossTangent: 0.02, conductorThicknessMm: 0.035, wireRadiusMm: 0.75,
  groundLengthMm: 90, groundWidthMm: 90, feedGapMm: 1, portImpedance: 50,
  ringRatio: 2, polarization: 'RHCP',
  undulations: 25, ampRatio: 0.20, serpRatio: 0.05, traceWidthMm: 1.0, groundPlane: 'Full',
};

test('every type maps to finite, non-empty mesh specs', () => {
  for (const t of ['rect', 'dipole', 'monopole', 'disk', 'annular', 'cp', 'uwb', 'serp']) {
    const r = synthesize(t, { ...base, type: t });
    const specs = geometryToMeshSpecs(r.geometry);
    assert.ok(specs.length > 0, `${t}: specs present`);
    for (const s of specs) {
      const coords = [...(s.pos || []), ...(s.p1 || []), ...(s.p2 || []), ...(s.size || [])];
      for (const c of coords) assert.ok(Number.isFinite(c), `${t}: finite coord`);
    }
    // every type has at least one conductor (steel) and a feed line
    assert.ok(specs.some((s) => s.color === 0xbfc7d0), `${t}: has PEC-colored solid`);
    assert.ok(specs.some((s) => s.kind === 'line'), `${t}: has feed line`);
  }
});

test('shape kinds match the antenna geometry', () => {
  assert.ok(geometryToMeshSpecs(synthesize('annular', { ...base, type: 'annular' }).geometry).some((s) => s.kind === 'ring'));
  assert.ok(geometryToMeshSpecs(synthesize('cp', { ...base, type: 'cp' }).geometry).some((s) => s.kind === 'shape'));
  assert.ok(geometryToMeshSpecs(synthesize('dipole', { ...base, type: 'dipole' }).geometry).filter((s) => s.kind === 'cylinder').length >= 2);
});

test('materialStyle: substrate translucent, pec opaque copper', () => {
  assert.equal(materialStyle('substrate').transparent, true);
  assert.ok(materialStyle('substrate').opacity < 1);
  assert.equal(materialStyle('pec').color, 0xbfc7d0);
  assert.equal(materialStyle('feed').color, 0xe0524d);
});

test('segmentOutline truncates the disk (fewer-than-circle extent along cut)', () => {
  const full = segmentOutline({ radius: 10, cuts: [] });
  const cut = segmentOutline({ radius: 10, cuts: [{ angleDeg: 0, depth: 2 }] });
  // max x of the cut outline must be reduced to ~R-depth = 8
  const maxXcut = Math.max(...cut.map((p) => p[0]));
  assert.ok(maxXcut <= 8.001 && maxXcut >= 7.5, `truncated maxX ${maxXcut}`);
  assert.ok(Math.max(...full.map((p) => p[0])) > 9.9);
});

test('sceneBounds yields a finite box for a real design', () => {
  const b = sceneBounds(geometryToMeshSpecs(synthesize('disk', { ...base, type: 'disk' }).geometry));
  assert.ok(b && Number.isFinite(b.size) && b.size > 0);
  for (const v of [...b.min, ...b.max, ...b.center]) assert.ok(Number.isFinite(v));
});

test('serpentine loop maps to a filled shape ribbon', () => {
  // base is grounded → closed loop → the trace is an annulus, so the mesh spec
  // must carry a hole or the 3D view renders a solid disc instead of a loop.
  const specs = geometryToMeshSpecs(synthesize('serp', { ...base, type: 'serp' }).geometry);
  const shape = specs.find((s) => s.kind === 'shape');
  assert.ok(shape, 'serp produces a filled shape');
  assert.ok(shape.outline.length > 500, 'ribbon outline is dense');
  assert.ok(shape.holes && shape.holes.length === 1, 'closed loop punches a hole');
  assert.equal(shape.holes[0].length, shape.outline.length);
  assert.equal(shape.color, 0xbfc7d0);   // steel conductor

  // ungrounded → open ribbon, a simple polygon with no hole
  const open = geometryToMeshSpecs(synthesize('serp', { ...base, type: 'serp', groundPlane: 'None' }).geometry);
  const openShape = open.find((s) => s.kind === 'shape');
  assert.ok(!openShape.holes, 'open ribbon needs no hole');
});

// Every IR shape has THREE consumers, not two: scene.js (3D), buildVba (export)
// and drawings.js (the static top/section views). A shape missing from drawings.js
// throws mid-render -- after the metrics panel updates but BEFORE viewer.update(),
// so the readouts change while the 3D model silently keeps the previous geometry.
test('drawings handle every shape the synthesis engines emit', async () => {
  const { topViewSVG, sectionViewSVG } = await import('../src/drawings.js');
  const base = {
    frequencyGHz: 2.45, lowerCutoffGHz: 3.1, substrateEr: 4.4, substrateHeightMm: 1.6,
    lossTangent: 0.02, conductorThicknessMm: 0.035, wireRadiusMm: 0.75,
    groundLengthMm: 90, groundWidthMm: 90, feedGapMm: 1, portImpedance: 50,
    ringRatio: 2, polarization: 'RHCP', undulations: 12, ampRatio: 0.2,
    serpRatio: 0.05, traceWidthMm: 0.8, groundPlane: 'Full',
    channelDiaMm: 0.5, zCycles: 48, maxStrainPct: 20,
  };
  const cases = [
    ['rect', {}], ['dipole', {}], ['monopole', {}], ['disk', {}], ['annular', {}],
    ['cp', {}], ['uwb', {}],
    ['serp', { conductorForm: 'Etched trace' }],
    ['serp', { conductorForm: 'Etched trace', groundPlane: 'None' }],
    ['serp', { conductorForm: 'Embedded channel' }],
  ];
  const seen = new Set();
  for (const [type, over] of cases) {
    const g = synthesize(type, { ...base, ...over, type }).geometry;
    for (const p of g) seen.add(p.shape);
    assert.doesNotThrow(() => topViewSVG(g), `topViewSVG threw for ${type} ${JSON.stringify(over)}`);
    assert.doesNotThrow(() => sectionViewSVG(g), `sectionViewSVG threw for ${type} ${JSON.stringify(over)}`);
  }
  // the conductor must actually appear, not be silently skipped
  const tubeGeom = synthesize('serp', { ...base, type: 'serp', conductorForm: 'Embedded channel' }).geometry;
  assert.match(topViewSVG(tubeGeom), /<path/, 'embedded channel must be drawn in the top view');
  assert.ok(sectionViewSVG(tubeGeom).length > 100, 'embedded channel must appear in section');
  assert.ok(seen.has('tube') && seen.has('trace'), `exercised shapes: ${[...seen].join(', ')}`);
});
