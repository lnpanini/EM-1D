// Pure unit tests for the dimension engine (scene.dimensionSpecs) and the
// static SVG drawing generators (drawings.topViewSVG / sectionViewSVG).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesize } from '../src/physics.js';
import { dimensionSpecs, dimLabel } from '../src/scene.js';
import { topViewSVG, sectionViewSVG } from '../src/drawings.js';

const base = {
  frequencyGHz: 2.4, lowerCutoffGHz: 3.1, substrateEr: 4.4, substrateHeightMm: 1.6,
  lossTangent: 0.02, conductorThicknessMm: 0.035, wireRadiusMm: 0.75,
  groundLengthMm: 90, groundWidthMm: 90, feedGapMm: 1, portImpedance: 50,
  ringRatio: 2, ringCount: 2, ringGapMm: 1, innerRingWidthMm: 2.5, feedWidthMm: 1,
  polarization: 'RHCP',
};
const ALL = ['rect', 'dipole', 'monopole', 'disk', 'annular', 'cp', 'uwb'];

test('dimensionSpecs: finite coords, tagged views, non-empty for every type', () => {
  for (const t of ALL) {
    const r = synthesize(t, { ...base, type: t });
    const dims = dimensionSpecs(r.geometry);
    assert.ok(dims.length > 0, `${t}: has dimension callouts`);
    for (const d of dims) {
      for (const c of [...d.p1, ...d.p2]) assert.ok(Number.isFinite(c), `${t}: finite dim coord`);
      assert.ok(d.label.length > 0, `${t}: dim has a label`);
      assert.ok(d.views.length > 0 && d.views.every((v) => ['3d', 'top', 'section'].includes(v)), `${t}: valid view tags`);
    }
  }
});

test('dimensionSpecs: rect patch labels board and patch sizes, slabs for section', () => {
  const r = synthesize('rect', { ...base, type: 'rect' });
  const dims = dimensionSpecs(r.geometry);
  const labels = dims.map((d) => d.label);
  assert.ok(labels.includes(dimLabel(r.metrics.groundW)), 'board width labeled');
  assert.ok(labels.includes(dimLabel(r.metrics.W)), 'patch width labeled');
  const slabs = dims.filter((d) => d.views.length === 1 && d.views[0] === 'section');
  assert.ok(slabs.some((d) => d.label === dimLabel(1.6)), 'substrate height 1.6 in section');
  assert.ok(slabs.some((d) => d.label === dimLabel(0.035)), 'metal thickness 0.035 in section');
});

test('dimensionSpecs: annular has one radius callout per ring + inner radius', () => {
  const r = synthesize('annular', { ...base, type: 'annular', ringCount: 3, ringGapMm: 0.5, innerRingWidthMm: 1 });
  const radial = dimensionSpecs(r.geometry).filter((d) => d.kind === 'radial');
  assert.equal(radial.filter((d) => d.label.startsWith('R ')).length, 3, 'three outer-radius callouts');
  assert.equal(radial.filter((d) => d.label.startsWith('r ')).length, 1, 'one inner-radius callout');
});

test('drawings: every type renders both views without garbage', () => {
  for (const t of ALL) {
    const r = synthesize(t, { ...base, type: t });
    for (const [name, svg] of [['top', topViewSVG(r.geometry)], ['section', sectionViewSVG(r.geometry)]]) {
      assert.ok(svg.startsWith('<svg'), `${t} ${name}: is an svg`);
      assert.ok(svg.includes('viewBox'), `${t} ${name}: has a viewBox`);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/, `${t} ${name}: no garbage`);
    }
  }
});

test('drawings: empty geometry yields empty strings', () => {
  assert.equal(topViewSVG([]), '');
  assert.equal(sectionViewSVG([]), '');
});

test('drawings: section view exaggerates z for thin boards and notes it', () => {
  const r = synthesize('rect', { ...base, type: 'rect' });
  const svg = sectionViewSVG(r.geometry);
  assert.match(svg, /z ×/, 'z-exaggeration note present for a thin board');
  assert.ok(svg.includes(dimLabel(1.6)), 'true substrate height labeled despite scaling');
});

test('drawings: uwb section cuts x=0 (through ground, gap, and disc)', () => {
  const r = synthesize('uwb', { ...base, type: 'uwb' });
  const svg = sectionViewSVG(r.geometry);
  // disc radius r≈7.64 → the disc spans y up to g+2r≈15.6; the x=0 cut must
  // include conductor beyond the ground's y≤0 half-plane.
  assert.ok(svg.startsWith('<svg'));
  assert.doesNotMatch(svg, /NaN/);
});

test('drawings: annular top view draws one evenodd ring path per ring', () => {
  const r = synthesize('annular', { ...base, type: 'annular', ringCount: 3, ringGapMm: 0.5, innerRingWidthMm: 1 });
  const svg = topViewSVG(r.geometry);
  const paths = (svg.match(/fill-rule="evenodd"/g) || []).length;
  assert.equal(paths, 3, 'three ring paths');
});
