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
};

test('every type maps to finite, non-empty mesh specs', () => {
  for (const t of ['rect', 'dipole', 'monopole', 'disk', 'annular', 'cp', 'uwb']) {
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
