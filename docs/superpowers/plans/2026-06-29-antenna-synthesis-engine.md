# Antenna Synthesis Engine (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn EM-1D into a 7-antenna synthesis engine (requirements → geometry) with closed-form/lightweight-numerical physics verified against textbook values, a dynamic UI, and type-specific CST VBA export.

**Architecture:** A pure, DOM-free `src/physics.js` exposes a numerical core (special functions + integrators/root-finders) and one synthesis model per antenna type. Each model returns `{ inputs, metrics, warnings, geometry }` where `geometry` is a primitive list consumed by `buildVba` now and the Phase-2 3D viewer later. `src/main.js` does DOM wiring + dynamic field visibility + VBA assembly. Node tests assert the verified reference values from the spec.

**Tech Stack:** Vanilla ES modules (browser-native `import`), Node 18+ test runner (`node --test`), no runtime dependencies. Static build via `cp`; dev/preview via `python -m http.server`.

## Global Constraints

- **Spec is authoritative:** `docs/superpowers/specs/2026-06-29-circular-antenna-synthesis-design.md`. All formulas come from its corrected §6; all assertion values from its §9.
- **Zero runtime dependencies** in Phase 1 (Three.js is Phase 2 only).
- **No build-system change:** build stays `rm -rf dist && mkdir -p dist && cp index.html dist/index.html && cp -R src dist/src`. Tests live in `test/` (root) so they are never copied to `dist/`.
- **Units:** lengths mm, frequency GHz, angles rad internally; constants `C_MM_PER_NS=299.792458`, `ETA0=376.730313`, `EPS0=8.8541878128e-12`, `MU0=4πe-7`, `SIGMA_CU=5.8e7`, `GAMMA=0.5772156649015329`, `CHI11=1.841183`.
- **KJ dispersion uses `fn = f_GHz · h_mm/10`** (h in cm). **Disk `Grad` uses `/120`** with the `J1'` integrand. **CP two-segment truncation uses `16√2`.** (These are the verified corrections.)
- **Geometry IR** (all primitives, mm, origin at antenna center, z = substrate normal):
  - `{ shape:'box', material, center:[x,y,z], size:{x,y,z} }`
  - `{ shape:'cylinder', material, center:[x,y,z], radius, height, axis:'z' }`
  - `{ shape:'ring', material, center:[x,y,z], rInner, rOuter, height, axis:'z' }`
  - `{ shape:'segment', material, center:[x,y,z], radius, height, axis:'z', cuts:[{angleDeg, depth}], slot:{lengthMm,widthMm,angleDeg}? }`
  - `{ shape:'feed', material:'feed', p1:[x,y,z], p2:[x,y,z], impedance }`
  - `material ∈ {'substrate','pec','feed'}`.
- **Verified reference implementations** to port formula bodies from (read-only, do not ship): `/private/tmp/claude-502/-Users-Bryan-Documents-GitHub-EM-1D/31d2b6ab-972b-4629-923a-79ee0705e8d6/scratchpad/verify_{special,dipole,rectpatch,disk,annular,cp,monopoleuwb}.mjs`.
- **Graceful degradation:** invalid/blank inputs return zeroed metrics + empty/placeholder geometry; never emit `NaN`/`Infinity`/`undefined` into VBA.
- **Commit after each task.** TDD: failing test → minimal impl → passing test → commit.

---

### Task 1: Numerical core in `src/physics.js`

**Files:**
- Create: `src/physics.js`
- Test: `test/physics.test.mjs`

**Interfaces:**
- Produces: `besselJ0(x)`, `besselJ1(x)`, `besselJ2(x)`, `neumannY0(x)`, `neumannY1(x)`, `Si(x)`, `Ci(x)`, `Cin(x)`, `simpson(f,a,b,n=100)`, `bisection(f,lo,hi,tol=1e-10,maxit=100)`, `newton(f,df,x0,tol=1e-10,maxit=50)`, plus exported constants. All `export`ed.

- [ ] **Step 1: Write failing tests** for the special functions using the spec §9 verified values.

```js
// test/physics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/physics.js';
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);

test('sine/cosine integrals', () => {
  close(P.Si(Math.PI/2), 1.37076, 1e-4);
  close(P.Si(Math.PI),   1.85194, 1e-4);
  close(P.Ci(1),         0.33740, 1e-4);
  close(P.Ci(2),         0.42298, 1e-4);
  close(P.Cin(2*Math.PI),2.43765, 1e-4);
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
```

- [ ] **Step 2: Run, verify fail.** `node --test test/physics.test.mjs` → FAIL (module/exports missing).
- [ ] **Step 3: Implement the core** in `src/physics.js`, porting the verified bodies from `verify_special.mjs` and the corrected spec §5. Series Bessel `Jn`, J2 recurrence, Neumann Y0/Y1 series (γ + harmonic numbers), Si/Ci dual-region (Taylor <1.5; A&S 5.2.38/5.2.39 rational ≥1.5), `Cin(x)=γ+ln(x)−Ci(x)`, composite `simpson`, `bisection` (scan-assisted), `newton`. Export all + constants.
- [ ] **Step 4: Run, verify pass.** `node --test test/physics.test.mjs` → PASS (3 tests).
- [ ] **Step 5: Commit.** `git add src/physics.js test/physics.test.mjs && git commit -m "feat(physics): numerical core (Bessel, Neumann, Si/Ci, integrators)"`

---

### Task 2: `rectPatch` model

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Consumes: Task 1 core.
- Produces: `rectPatch(d)` where `d={frequencyGHz,substrateEr,substrateHeightMm,lossTangent,conductorThicknessMm,portImpedance}` → `{inputs,metrics:{W,eeff0,eeffF,deltaL,L,G1,G12,Rin0,insetY0,Qt,bandwidthPct,groundL,groundW},warnings,geometry}`.

- [ ] **Step 1: Failing test** (spec §9 rect-patch block).

```js
test('rect patch FR4 2.4GHz', () => {
  const r = P.rectPatch({frequencyGHz:2.4, substrateEr:4.4, substrateHeightMm:1.6, lossTangent:0.02, conductorThicknessMm:0.035, portImpedance:50});
  close(r.metrics.W, 38.010, 0.05);
  close(r.metrics.eeff0, 4.0431, 0.01);
  close(r.metrics.eeffF, 4.0498, 0.01);     // KJ with fn=f*h_cm
  close(r.metrics.deltaL, 0.737, 0.02);
  close(r.metrics.L, 29.56, 0.2);
  close(r.metrics.G1, 9.69285e-4, 1e-6);
  close(r.metrics.G12, 5.92681e-4, 1e-6);
  close(r.metrics.Rin0, 320.11, 2);
  assert.ok(r.geometry.length >= 4); // substrate, ground, patch, feed
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `rectPatch` per corrected spec §6.1 (HJ `εeff0` with `a(u)·b(εr)`; KJ dispersion with `fn=f·h_mm/10`; Hammerstad `ΔL`; `L`; Simpson `I1/I12`→`G1/G12`→`Rin0`; inset `y0=(L/π)acos√(Zin/Rin0)`; Q/BW; ground `L+6h,W+6h`). Emit geometry boxes + feed. Port from `verify_rectpatch.mjs`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): rectangular patch synthesis"`

---

### Task 3: `dipole` model

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Consumes: Task 1 core (`Si,Ci,Cin`).
- Produces: `dipole(d)` where `d={frequencyGHz,wireRadiusMm,feedGapMm}` → `{inputs,metrics:{lengthMm,armMm,R,X,resonantLengthRatio},warnings,geometry}`. Also export `dipoleImpedance(L_mm, a_mm, lambda0_mm) → {R,X}` (reused by monopole).

- [ ] **Step 1: Failing test.**

```js
test('dipole impedance + resonance', () => {
  const lam = P.C_MM_PER_NS / 0.3; // 300 MHz -> 999.3 mm
  const z = P.dipoleImpedance(0.5*lam, 1e-4*lam, lam);
  close(z.R, 73.08, 0.5); close(z.X, 42.52, 0.5);
  const r = P.dipole({frequencyGHz:0.3, wireRadiusMm:1, feedGapMm:1});
  close(r.metrics.resonantLengthRatio, 0.4775, 0.005);
  close(r.metrics.R, 63.98, 1); close(Math.abs(r.metrics.X), 0, 1);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** induced-EMF `Rm/Xm` (spec §6.2), `Zin=(Rm+jXm)/sin²(k0L/2)`, resonance by `bisection` on `X(L)=0` over `[0.40,0.50]λ0`. Geometry: two `cylinder` arms split by feed gap + `feed`. Port from `verify_dipole.mjs`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): induced-EMF dipole synthesis"`

---

### Task 4: `monopole` model

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Consumes: Task 3 `dipoleImpedance`.
- Produces: `monopole(d)` where `d={frequencyGHz,wireRadiusMm,groundLengthMm,groundWidthMm,feedGapMm}` → `{inputs,metrics:{heightMm,R,X},warnings,geometry}`.

- [ ] **Step 1: Failing test.**

```js
test('monopole = half dipole', () => {
  const r = P.monopole({frequencyGHz:0.3, wireRadiusMm:1, groundLengthMm:500, groundWidthMm:500, feedGapMm:1});
  close(r.metrics.R, 31.99, 0.5); // half of dipole 63.98
  close(Math.abs(r.metrics.X), 0, 1);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** image theory: resonant length of equivalent dipole (length `2h`), `height=L_res/2`, `Z=Z_dipole/2` (spec §6.3). Geometry: radiator `cylinder` over ground `box` + feed. Port from `verify_dipole.mjs` monopole branch.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): monopole synthesis (image theory)"`

---

### Task 5: `circularDisk` model

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Consumes: Task 1 core (`besselJ0/J1`, `simpson`, `newton`).
- Produces: `circularDisk(d)` where `d={frequencyGHz,substrateEr,substrateHeightMm,lossTangent,portImpedance}` → `{inputs,metrics:{a,ae,frCheck,Grad,Gc,Gd,Redge,probeRho0,Qt,bandwidthPct,groundRadius,matchable},warnings,geometry}`.

- [ ] **Step 1: Failing test** (spec §9 disk block, corrected `/120` Grad).

```js
test('circular disk FR4 2.4GHz', () => {
  const r = P.circularDisk({frequencyGHz:2.4, substrateEr:4.4, substrateHeightMm:1.6, lossTangent:0.02, portImpedance:50});
  close(r.metrics.a, 16.945, 0.05);
  close(r.metrics.ae, 17.467, 0.05);
  close(r.metrics.frCheck, 2.3984, 0.005);
  close(r.metrics.Grad, 1.5757e-3, 1e-5);
  close(r.metrics.Redge, 240.29, 2);
  close(r.metrics.probeRho0, 5.233, 0.05);
  assert.equal(r.metrics.matchable, true);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** spec §6.4: `F`, `a`, `ae`, `fr` check; `Grad=(k0 ae)²/120·∫[...]`; `Gc/Gd` from `C=ω0 ε0 εr π ae²(1−1/χ11²)/(2h)`; `Redge`; probe match via `newton` on `J1(kρ0)=J1(χ11)√(Zin/Redge)`, `k=χ11/ae`; warn + `matchable=false` if `Redge<Zin`. Geometry: substrate/ground boxes, patch `cylinder` (disk), `feed` at `(ρ0,0)`. Port from `verify_disk.mjs`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): circular disk patch synthesis"`

---

### Task 6: `annularRing` model

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Consumes: Task 1 core (`besselJ0/J1`, `neumannY0/Y1`, `bisection`).
- Produces: `annularRing(d)` where `d={frequencyGHz,substrateEr,substrateHeightMm,lossTangent,ringRatio,portImpedance}` → `{inputs,metrics:{a,b,x0,aeff,Qt,bandwidthPct},warnings,geometry}`. Also export `annularRoot(rho)`.

- [ ] **Step 1: Failing test** (spec §9 annular block).

```js
test('annular ring rho=2', () => {
  close(P.annularRoot(2), 0.677336, 1e-4);
  const r = P.annularRing({frequencyGHz:2.4, substrateEr:4.4, substrateHeightMm:1.6, lossTangent:0.02, ringRatio:2, portImpedance:50});
  close(r.metrics.a, 6.458, 0.02);
  close(r.metrics.b, 12.916, 0.02);
  close(r.metrics.b/r.metrics.a, 2.0, 1e-3);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** spec §6.5: characteristic root `J1'(x)Y1'(ρx)−J1'(ρx)Y1'(x)=0` via scan+`bisection`; fringing `d=h/√εr`; iterate `ρeff↔aeff`; `a=aeff+d`, `b=ρa`. Geometry: substrate/ground boxes, patch `ring` (rInner=a,rOuter=b), `feed` at `rf`. Port from `verify_annular.mjs`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): annular ring patch synthesis"`

---

### Task 7: `cpCircular` model

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Consumes: Task 5 `circularDisk` (radius + Q).
- Produces: `cpCircular(d)` where `d={frequencyGHz,substrateEr,substrateHeightMm,lossTangent,polarization,portImpedance}` → `{inputs,metrics:{a,Qt,deltaSratio,truncationDepth,slotLength,slotWidth,f1,f2,arBandwidthPct,feedRho0,feedAngleDeg},warnings,geometry}`.

- [ ] **Step 1: Failing test** (spec §9 CP block, corrected `16√2`).

```js
test('CP circular perturbation', () => {
  const r = P.cpCircular({frequencyGHz:2.4, substrateEr:4.4, substrateHeightMm:1.6, lossTangent:0.02, polarization:'RHCP', portImpedance:50});
  close(r.metrics.deltaSratio, 1/(2*r.metrics.Qt), 1e-6);
  assert.ok(r.metrics.f1 < r.metrics.f2);
  close((r.metrics.f2 - r.metrics.f1)/r.frequencyGHz ?? 0, 1/r.metrics.Qt, 1e-3); // see impl note
  assert.ok(r.metrics.truncationDepth > 0 && r.metrics.slotLength > 0);
  close(r.metrics.feedAngleDeg, 45, 1e-9);
});
```

> Impl note: store `f0` in metrics so the split-ratio assert can divide by it; adjust the test to `(f2-f1)/r.metrics.f0`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** spec §6.6: reuse disk radius+Q; `ΔS/S=1/(2Q)`; `Δb=a·(3π/(16√2 Q))^{2/3}`; slot `Ls=a√(π/(2αQ))`,`Ws=αLs`(α=0.1); `f1,2=f0(1∓1/(2Q))`; `AR BW=0.348/Q`; feed on ±45° (sign by polarization) at `rf≈0.35a`. Geometry: patch `segment` (disk + two `cuts` at ±45°), `feed`. Port from `verify_cp.mjs`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): circularly-polarized circular patch synthesis"`

---

### Task 8: `discMonopoleUWB` model

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Produces: `discMonopoleUWB(d)` where `d={lowerCutoffGHz,feedGapMm,groundLengthMm,groundWidthMm}` → `{inputs,metrics:{discRadius,reqRadius,groundW,groundL,fLcheck},warnings,geometry}`.

- [ ] **Step 1: Failing test** (spec §9 UWB block).

```js
test('UWB disc monopole', () => {
  const r = P.discMonopoleUWB({lowerCutoffGHz:3.1, feedGapMm:0.3, groundLengthMm:30, groundWidthMm:40});
  close(r.metrics.discRadius, 7.642, 0.01);
  close(r.metrics.reqRadius, 3.821, 0.01);
  close(r.metrics.fLcheck, 3.100, 0.001);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** spec §6.7 Liang `r=((7.2/fL)−g_cm)/3` (cm), `req=r/2`, `Wg≥4r`,`Lg≥3r`, back-check `fL`. Geometry: disc `cylinder` (thin), ground `box` with gap, `feed` across gap. Port from `verify_monopoleuwb.mjs`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): UWB disc monopole synthesis"`

---

### Task 9: `synthesize` dispatcher + `buildVba`

**Files:** Modify `src/physics.js`; Test `test/physics.test.mjs`.

**Interfaces:**
- Consumes: all model fns.
- Produces: `synthesize(type, design)` → model result (type ∈ `rect|dipole|monopole|disk|annular|cp|uwb`); `buildVba(result, design)` → VBA string. `TYPES` array `[{key,label}]` for the UI.

- [ ] **Step 1: Failing tests:** every type returns finite metrics + non-empty geometry; invalid input degrades; `buildVba` output contains no `NaN/Infinity/undefined` and includes `Sub Main`/`End Sub`.

```js
const ALL = ['rect','dipole','monopole','disk','annular','cp','uwb'];
test('synthesize all types robust', () => {
  for (const t of ALL) {
    const base = {frequencyGHz:2.4, lowerCutoffGHz:3.1, substrateEr:4.4, substrateHeightMm:1.6, lossTangent:0.02, conductorThicknessMm:0.035, wireRadiusMm:0.75, groundLengthMm:90, groundWidthMm:90, feedGapMm:1, portImpedance:50, ringRatio:2, polarization:'RHCP'};
    const r = P.synthesize(t, base);
    assert.ok(r.geometry.length > 0);
    for (const v of Object.values(r.metrics)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
    const vba = P.buildVba(r, base);
    assert.doesNotMatch(vba, /NaN|Infinity|undefined/);
    assert.match(vba, /Sub Main[\s\S]*End Sub/);
  }
});
test('synthesize blank freq degrades', () => {
  const r = P.synthesize('rect', {frequencyGHz:0, substrateEr:4.4, substrateHeightMm:1.6, lossTangent:0.02, portImpedance:50});
  for (const v of Object.values(r.metrics)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `synthesize` (validate inputs → dispatch → on invalid return zeroed metrics+placeholder geometry) and `buildVba` (geometry IR → CST per spec §8: `box`→Brick, `cylinder`→Cylinder, `ring`→outer−inner Cylinder, `segment`→disk+Boolean cuts, `feed`→DiscretePort; header comments from metrics+warnings; `lossTangent` in Material; solver span resonant `[0.7f,1.3f]` / UWB `[fL,12fL]`).
- [ ] **Step 4: Run, verify pass.** Then full suite `node --test test/`.
- [ ] **Step 5: Commit.** `git commit -am "feat(physics): synthesize dispatcher + geometry-driven VBA"`

---

### Task 10: Dynamic UI in `index.html`

**Files:** Modify `index.html`.

**Interfaces:**
- Consumes: `TYPES`, field ids. Produces: DOM with all inputs (id-matched to `design` keys) + a 7-option `#type` select + metric `<span id>` slots + per-row `data-types` attributes for visibility.

- [ ] **Step 1:** Add the 7 `<option>`s to `#type`; add inputs `lossTangent`, `ringRatio`, `polarization` (select LHCP/RHCP), `lowerCutoffGHz`; tag every input-`<label>` and metric row with `data-types="rect disk annular cp ..."` listing the types that show it (per spec §7). Relabel the frequency row: a `lowerCutoffGHz` field shown only for `uwb`, the `frequencyGHz` field hidden for `uwb`.
- [ ] **Step 2:** Add metric slots: `eeff, sizeMain, inset, edgeR, q, bw, ground, impedance, resonant, probe, splitFreqs, arBw, matchable` as `<strong id>` in the summary card, each row tagged with `data-types`.
- [ ] **Step 3: Manual check** (no unit test for HTML): `node --check` not applicable; verify structure by loading in the smoke test (Task 12). Visual check deferred to run.
- [ ] **Step 4: Commit.** `git commit -am "feat(ui): dynamic 7-type form + metric slots"`

---

### Task 11: `main.js` wiring + `styles.css`

**Files:** Modify `src/main.js`, `src/styles.css`.

**Interfaces:**
- Consumes: `synthesize`, `buildVba`, `TYPES` from `physics.js`; DOM ids from Task 10.
- Produces: `readDesign()`, `applyVisibility(type)`, `render()` event wiring, copy/download handlers.

- [ ] **Step 1:** `import { synthesize, buildVba, TYPES } from './physics.js';`. Implement `readDesign()` (numeric coercion; `type`/`polarization` as strings).
- [ ] **Step 2:** `applyVisibility(type)` toggles `[data-types]` elements via `el.hidden = !el.dataset.types.split(' ').includes(type)`.
- [ ] **Step 3:** `render()`: `const r = synthesize(type, design)`; fill visible metric slots from `r.metrics` (formatted, units); show `r.warnings`; set VBA textarea `= buildVba(r, design)`. Wire `#controls` `input`+`change`, `#type` `change`→`applyVisibility`+`render`, copy/download (download filename `${type}-${freq}GHz-cst.vba`). Call `applyVisibility`+`render` once at load.
- [ ] **Step 4:** `styles.css`: style `[hidden]{display:none}` already implicit; ensure metric grid + new inputs lay out; add a `.warn` style.
- [ ] **Step 5: Commit.** `git commit -am "feat(ui): wire dynamic synthesis + warnings + export"`

---

### Task 12: Test script, full verification, build check

**Files:** Modify `package.json`; Create `test/smoke.test.mjs`.

- [ ] **Step 1:** Add `"test": "node --test test/"` to `package.json` scripts.
- [ ] **Step 2:** Write `test/smoke.test.mjs` — DOM-stub `main.js` (or directly drive `synthesize`+`buildVba`) across all 7 types asserting non-empty VBA and no `NaN`. (If `main.js` is hard to import due to top-level DOM, keep the smoke at the `physics.js` level — already covered by Task 9; this step adds a stubbed-DOM `main.js` load that sets `document`/`navigator` shims and asserts `render()` runs without throwing for each type.)
- [ ] **Step 3: Run full verification:**
  - `node --test test/` → all PASS.
  - `node --check src/physics.js src/main.js` → OK.
  - `npm run build && find dist -type f && node --check dist/src/physics.js && rm -rf dist` → dist built, JS valid.
- [ ] **Step 4: Commit.** `git commit -am "test: full suite + build verification for synthesis engine"`

---

## Self-Review

**Spec coverage:** §3 architecture → Tasks 1,9,10,11,12; §4 IR → Global Constraints + every model; §5 core → Task 1; §6.1–6.7 models → Tasks 2–8; §7 dynamic UI → Tasks 10,11; §8 VBA → Task 9; §9 verification → Tasks 1–9 asserts + Task 12; §10 corrections → folded into Global Constraints + Tasks 2,5,7. No gaps.

**Placeholder scan:** No "TBD/TODO/handle edge cases" left; formula bodies reference the corrected spec §6 + named verified scripts (not vague). Test code is concrete with verified numbers.

**Type consistency:** `synthesize(type,design)`/`buildVba(result,design)`/`dipoleImpedance`/`annularRoot`/`circularDisk` names are stable across Tasks 1–12; metric keys used in Task 11 come from each model's documented `metrics` object; geometry IR identical everywhere.

> Note for the CP split-ratio assertion (Task 7): the model must expose `metrics.f0` so the test divides by it; the inline test comment flags this.
