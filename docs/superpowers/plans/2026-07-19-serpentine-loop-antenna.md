# Serpentine Loop Antenna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an 8th antenna type — a serpentine (meander) loop on FR-4 with a Full/None ground-plane toggle — to the EM-1D synthesis engine at full parity (physics, metrics, 3D viewer, CST VBA).

**Architecture:** One new pure model `serpentineLoop(design)` in `physics.js` returns the standard `{inputs, metrics, warnings, geometry}`. It emits one new geometry IR primitive, `trace` (a constant-width ribbon polygon), plus reused `box`/`feed` primitives. `scene.js` maps `trace` → the existing flat `shape` mesh; `buildVba()` maps it → one CST extruded polygon. `main.js` + `styles.css` register the type in the UI. The loop is solved to resonate at one guided wavelength (`R = λg / G`), with `εeff` switching between microstrip (grounded) and interface-strip (ungrounded).

**Tech Stack:** Vanilla ES modules, browser-native; Node `node:test` zero-dependency test runner; Three.js (vendored, viewer only — untouched here).

## Global Constraints

- Units: **mm, GHz, radians** throughout `physics.js`. `C_MM_PER_NS = 299.792458`.
- **No runtime dependencies**; no build-system change. `physics.js` and `scene.js` stay pure (no DOM/THREE imports).
- Curve sign convention (matches the source equation, verified in preview):
  `x = (R + A·sin n t)·cos t + S·sin 2n t·sin t`, `y = (R + A·sin n t)·sin t − S·sin 2n t·cos t`.
- `εeff` — grounded (microstrip, Hammerstad): `(εr+1)/2 + (εr−1)/2·(1+12h/w)^(−1/2)`; ungrounded (interface): `(εr>1) ? (εr+1)/2 : 1`.
- Sizing: `R = λg / G`, `λg = λ0/√εeff`, `G = ∮₀^{2π}|r′(t)|dt` on the unit curve.
- Tests live in `test/` (never shipped to `dist/`). Run with `node --test` (or `npm test`).
- Follow existing patterns: model function shape, IR primitive style, VBA helper style, `FIELDS/TYPE_FIELDS/VIEW/GLYPH` maps.
- Reference values (independently computed): `G(circle)=2π=6.283185`; `G(25,0.2,0.05)=25.2668`; grounded FR-4 default `εeff=3.0782, R=2.7603, footprintD=7.6247, meander=4.0213`; no-ground FR-4 `εeff=2.70, R=2.9473, footprintD=8.0735`; air `εeff=1, R=4.8429`.

---

### Task 1: Serpentine loop model (`serpentineLoop`)

**Files:**
- Modify: `src/physics.js` (add §6.8 block before the "Dispatcher + degradation" section, ~line 574)
- Test: `test/physics.test.mjs` (append)

**Interfaces:**
- Consumes: existing `num`, `C_MM_PER_NS`, `simpson` (not required — a local dense Simpson is used).
- Produces:
  - `serpShapeFactor(n, a, s) -> number` (exported) — unit-curve length `G`.
  - `serpentineLoop(design) -> { inputs, metrics, warnings, geometry }` (exported). `metrics` has
    `{ R, A, S, outerR, footprintD, Lpath, G, meander, eeff, lamg, plainLoopD, miniaturize, Rrad, n, grounded, feedGap }`
    (`Rrad` is `null` when grounded; `grounded` is boolean). `geometry` holds one
    `{ shape:'trace', material:'pec', outline:[[x,y]…], center:[0,0,0], thickness }`, an optional
    `substrate` box (when `εr>1`), an optional `pec` ground box (when grounded), and one `feed`.

- [ ] **Step 1: Write the failing tests**

Append to `test/physics.test.mjs`:

```js
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
  // the heuristic must catch a moderate-n overlap (closest approach is ~half an undulation apart)
  assert.ok(mk(14).warnings.some((w) => /self-overlap/.test(w)), 'n=14 self-overlaps');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/physics.test.mjs`
Expected: FAIL — `P.serpShapeFactor is not a function` / `P.serpentineLoop is not a function`.

- [ ] **Step 3: Implement the model**

In `src/physics.js`, insert this block immediately before the line
`// Dispatcher + degradation` (the `export const TYPES = [` section):

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/physics.test.mjs`
Expected: PASS (all four new tests green; existing tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/physics.js test/physics.test.mjs
git commit -m "feat(physics): serpentine loop model (serpentineLoop + trace IR)"
```

---

### Task 2: Register `serp` in the dispatcher

**Files:**
- Modify: `src/physics.js` — `TYPES` (~line 577), `SUBSTRATE_TYPES` (~line 609), `synthesize` switch (~line 621)
- Test: `test/physics.test.mjs` (append)

**Interfaces:**
- Consumes: `serpentineLoop` (Task 1), existing `synthesize`, `TYPES`, `SUBSTRATE_TYPES`.
- Produces: `synthesize('serp', design)` routes to `serpentineLoop`; `TYPES` includes `{key:'serp', label:'Serpentine Loop'}`.

- [ ] **Step 1: Write the failing tests**

Append to `test/physics.test.mjs`:

```js
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
  assert.ok(bad.geometry.length >= 1 && bad.warnings.length >= 1);
  // missing frequency → clean empty result
  const nofreq = P.synthesize('serp', { type: 'serp', undulations: 25, ampRatio: 0.2, serpRatio: 0.05, substrateEr: 4.4, substrateHeightMm: 1.6 });
  assert.equal(nofreq.geometry.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/physics.test.mjs`
Expected: FAIL — `serp` absent from `TYPES`; `synthesize('serp', …)` returns the "unknown antenna type" branch (empty geometry) so `good.geometry.length >= 3` fails.

- [ ] **Step 3: Implement the registration (three edits)**

Edit A — add to the `TYPES` array (after the `uwb` entry):
```js
  { key: 'uwb', label: 'UWB Disc Monopole' },
  { key: 'serp', label: 'Serpentine Loop' },
];
```

Edit B — add `serp` to `SUBSTRATE_TYPES`:
```js
const SUBSTRATE_TYPES = new Set(['rect', 'disk', 'annular', 'cp', 'serp']);
```

Edit C — add a case to the `synthesize` switch (after the `uwb` case):
```js
      case 'uwb': r = discMonopoleUWB(design); break;
      case 'serp': r = serpentineLoop(design); break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/physics.test.mjs`
Expected: PASS. Then run the full suite: `npm test` — all existing suites still green.

- [ ] **Step 5: Commit**

```bash
git add src/physics.js test/physics.test.mjs
git commit -m "feat(physics): register serp type in dispatcher + substrate validation"
```

---

### Task 3: Render the `trace` primitive (`scene.js`)

**Files:**
- Modify: `src/scene.js` — `geometryToMeshSpecs` (add a branch, ~line 69)
- Test: `test/scene.test.mjs`

**Interfaces:**
- Consumes: `synthesize('serp', …)` geometry with a `trace` primitive.
- Produces: `geometryToMeshSpecs` maps `trace` → `{ kind:'shape', outline, pos, color, opacity, transparent }`
  (same shape spec the CP `segment` produces; `sceneBounds` already handles `kind:'shape'`).

- [ ] **Step 1: Write the failing test**

In `test/scene.test.mjs`, extend the shared `base` object with the serp fields, add `'serp'` to the
"every type" loop, and add a serp-specific test. Change `base` to:

```js
const base = {
  frequencyGHz: 2.4, lowerCutoffGHz: 3.1, substrateEr: 4.4, substrateHeightMm: 1.6,
  lossTangent: 0.02, conductorThicknessMm: 0.035, wireRadiusMm: 0.75,
  groundLengthMm: 90, groundWidthMm: 90, feedGapMm: 1, portImpedance: 50,
  ringRatio: 2, polarization: 'RHCP',
  undulations: 25, ampRatio: 0.20, serpRatio: 0.05, traceWidthMm: 1.0, groundPlane: 'Full',
};
```

Add `'serp'` to the loop array in the first test:

```js
  for (const t of ['rect', 'dipole', 'monopole', 'disk', 'annular', 'cp', 'uwb', 'serp']) {
```

Append a new test:

```js
test('serpentine loop maps to a filled shape ribbon', () => {
  const specs = geometryToMeshSpecs(synthesize('serp', { ...base, type: 'serp' }).geometry);
  const shape = specs.find((s) => s.kind === 'shape');
  assert.ok(shape, 'serp produces a filled shape');
  assert.ok(shape.outline.length > 1000, 'ribbon outline is dense');
  assert.equal(shape.color, 0xbfc7d0);   // steel conductor
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/scene.test.mjs`
Expected: FAIL — `serp` geometry's `trace` primitive is skipped by `geometryToMeshSpecs`, so no
`kind:'shape'` spec exists (and the first loop fails its steel/line assertions for `serp`).

- [ ] **Step 3: Implement the branch**

In `src/scene.js`, inside `geometryToMeshSpecs`, add a `trace` branch (place it right before the
`segment` branch or the `feed` branch):

```js
    } else if (p.shape === 'trace') {
      specs.push({ kind: 'shape', outline: p.outline, pos: [...p.center], ...style });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/scene.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene.js test/scene.test.mjs
git commit -m "feat(scene): map trace primitive to a filled shape ribbon"
```

---

### Task 4: CST VBA export for `trace` (`buildVba`)

**Files:**
- Modify: `src/physics.js` — add `vbaExtrudePolygon` helper (near the other `vba*` helpers, ~line 710) and a `trace` branch in `buildVba`'s `geometry.forEach` (~line 786)
- Test: `test/physics.test.mjs` (append)

**Interfaces:**
- Consumes: existing `vn`, `mat` helpers; the `trace` primitive from Task 1.
- Produces: `buildVba(result, design)` emits a `With Extrude … .Mode "Pointlist" … .Create End With`
  solid for each `trace`, alongside the existing substrate material block, ground `Brick`, and
  `DiscretePort`.

- [ ] **Step 1: Write the failing test**

Append to `test/physics.test.mjs`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/physics.test.mjs`
Expected: FAIL — no `With Extrude` in the macro (the `trace` primitive is ignored by `buildVba`).

- [ ] **Step 3: Implement the helper + branch**

Edit A — add the helper (place it just before `function vbaDiscretePort(` in `src/physics.js`):

```js
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
```

Edit B — add the `trace` branch inside `buildVba`'s `geometry.forEach((p, i) => { … })`, before the
`else if (p.shape === 'feed')` branch:

```js
    } else if (p.shape === 'trace') {
      body.push(vbaExtrudePolygon(`trace_${i}`, comp, p.material, p.outline, num(p.center[2]), p.thickness));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/physics.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/physics.js test/physics.test.mjs
git commit -m "feat(physics): CST VBA extruded-polygon export for trace primitive"
```

---

### Task 5: UI wiring + glyph (`main.js`, `styles.css`)

**Files:**
- Modify: `src/main.js` — `GLYPH` (~line 10), `FIELDS` (~line 13), `TYPE_FIELDS` (~line 28), `VIEW` (~line 41), `mainSize` (~line 281), `edgeOrZ` (~line 293)
- Modify: `src/styles.css` — add `.g-serp` (after the `.g-uwb` rule, ~line 131)
- Test: `test/smoke.test.mjs` (unchanged assertion; must still pass) + browser spot-check

**Interfaces:**
- Consumes: `synthesize('serp', …)` metrics (Task 1), `TYPES` entry (Task 2), `GLYPH.serp`.
- Produces: the Serpentine Loop picker card, its type-gated fields, KPIs/readout/results, and compare rows.

- [ ] **Step 1: Add the glyph CSS**

In `src/styles.css`, after the `.g-uwb { … }` line, add:

```css
.g-serp { position: relative; width: 46%; aspect-ratio: 1; border-radius: 50%; background: repeating-conic-gradient(#dfe4ea 0deg 8deg,#b4bcc6 8deg 16deg); box-shadow: 0 0 0 4px rgba(46,125,91,.5); }
.g-serp::after { content: ""; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 46%; aspect-ratio: 1; border-radius: 50%; background: var(--panel-900); box-shadow: inset 0 0 0 1px rgba(46,125,91,.7); }
```

- [ ] **Step 2: Wire `main.js` — GLYPH, FIELDS, TYPE_FIELDS**

Edit A — add to the `GLYPH` object:
```js
const GLYPH = { rect: 'g-rect', dipole: 'g-line', monopole: 'g-vline', disk: 'g-disk', annular: 'g-ring', cp: 'g-cp', uwb: 'g-uwb', serp: 'g-serp' };
```

Edit B — add these entries to the `FIELDS` object (before the closing `};`):
```js
  undulations:   { label: 'Undulations', sym: 'n', def: 12, group: 'Shape' },
  ampRatio:      { label: 'Undulation depth', sym: 'A/R', def: 0.20, group: 'Shape' },
  serpRatio:     { label: 'Serpentine kink', sym: 'S/R', def: 0.05, group: 'Shape' },
  traceWidthMm:  { label: 'Trace width', sym: 'w', unit: 'mm', def: 1.0, group: 'Shape' },
  groundPlane:   { label: 'Ground plane', group: 'Substrate', select: ['Full', 'None'] },
```

Edit C — add the `serp` entry to `TYPE_FIELDS`:
```js
  serp: ['frequencyGHz', 'undulations', 'ampRatio', 'serpRatio', 'traceWidthMm', 'substrateEr', 'substrateHeightMm', 'lossTangent', 'groundPlane', 'feedGapMm', 'portImpedance'],
```

- [ ] **Step 3: Wire `main.js` — VIEW, compare rows**

Edit D — add the `serp` entry to the `VIEW` object:
```js
  serp: {
    readout: (m) => [['R', fmt(m.R)], ['Ø', fmt(m.footprintD)]],
    kpis: (m) => [['Footprint Ø · mm', fmt(m.footprintD)], ['Conductor · mm', fmt(m.Lpath)], ['Meander · ×', fmt(m.meander, 2)]],
    results: (m) => [
      ['Base radius R', fmt(m.R) + ' mm'],
      ['Guided λg', fmt(m.lamg) + ' mm'],
      ['Effective εeff', fmt(m.eeff, 2)],
      ['Ground plane', m.grounded ? 'full' : 'none'],
      ['Miniaturization', fmt(m.miniaturize, 2) + '×'],
      ['Undulations n', fmt(m.n, 0)],
      ['Rad. resistance', m.Rrad == null ? '— (grounded)' : '≈ ' + fmt(m.Rrad, 0) + ' Ω', 1],
      ['Feed gap', fmt(m.feedGap) + ' mm'],
    ],
  },
```

Edit E — add a `serp` case to `mainSize` (inside its `switch (p.type)`):
```js
    case 'serp': return `Ø ${fmt(m.footprintD)} mm`;
```

Edit F — add a `serp` clause to `edgeOrZ` (before its final `return '—';`):
```js
  if (p.type === 'serp') return p.metrics.grounded ? 'grounded' : '≈ ' + fmt(p.metrics.Rrad, 0) + ' Ω';
```

- [ ] **Step 4: Verify the wiring (automated + browser)**

Run: `node --check src/main.js && npm test`
Expected: `node --check` clean; all suites PASS (the smoke test still imports `main.js` and renders
the initial `rect` macro without throwing — proves the new maps didn't break the load path).

Then a browser spot-check:
```bash
npm run dev    # serves http://localhost:5173
```
Open the page, click **Serpentine Loop** in the topology picker, and confirm:
- the glyph shows a segmented ring; the Shape/Substrate/Feed fields appear (n, A/R, S/R, w, εr, h, tanδ, Ground plane, gap, Z₀);
- KPIs read Footprint Ø ≈ 13.44 mm, Conductor ≈ 69.7 mm, Meander ≈ 2.14× at the defaults (n=12);
- toggling Ground plane `None` grows Footprint Ø to ≈ 14.28 mm; a radiation-suppression warning shows on `Full`; setting `n` to 25 shows a self-overlap warning;
- the CST export panel contains `With Extrude` / `.Mode "Pointlist"`.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "feat(ui): register Serpentine Loop type (fields, KPIs, compare, glyph)"
```

---

## Self-review notes

- **Spec coverage:** §4 trace IR → Task 1/3/4; §5 math → Task 1; §6 geometry → Task 1; §7 UI → Task 5;
  §8 VBA → Task 4; §9 verification numbers → Tasks 1–4 assertions; dispatcher/§3 → Task 2. All covered.
- **Type consistency:** `serpentineLoop`, `serpShapeFactor`, `groundPlane`, `metrics.{footprintD,Lpath,meander,eeff,lamg,miniaturize,Rrad,grounded,n}` names are identical across physics, scene, main, and tests.
- **No placeholders:** every step carries complete code and an exact run command.
