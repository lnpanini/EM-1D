# EM-1D Antenna Synthesis Engine — Phase 1 Design Spec

**Date:** 2026-06-29
**Status:** Approved (design); pending spec review
**Phase:** 1 of 2 (Phase 2 = 3D parametric viewer, separate spec)

---

## 1. Context & goals

EM-1D is a browser-based, statically-deployed (Vercel) tool that **synthesizes** antenna
geometry from design *requirements* (you set frequency/substrate/target impedance; it computes
the dimensions) and exports a CST Studio Suite VBA macro.

Today it supports 3 antennas (rectangular patch, dipole, monopole) with first-order textbook
formulas. Phase 1 will:

1. **Refine the physics to maximum practical closed-form accuracy** for the existing 3 types.
2. **Add 4 circular form factors**: circular disk patch, annular ring patch, circularly-polarized
   (CP) circular patch, and UWB planar circular disc monopole — 7 types total.
3. Make the tool an explicit **synthesis engine**: per-type *required inputs* → computed
   *geometry + performance outputs*, with a **dynamic UI** that shows only relevant fields.
4. Produce a **geometry intermediate representation (IR)** consumed by both the VBA generator
   (Phase 1) and the future 3D viewer (Phase 2).

All models stay **closed-form or lightweight-numerical** (series, Simpson integration, bisection,
Newton) — no full-wave solver, no runtime dependencies in Phase 1.

## 2. Non-goals / scope guardrails (YAGNI)

- No full-wave / method-of-moments solver.
- No runtime dependencies in Phase 1 (Three.js arrives in Phase 2 only, vendored).
- No build-system change (build stays `cp`-based; dev/preview stay `python -m http.server`).
- 7 antenna types only; no additional form factors this phase.
- 3D viewer is **out of scope for Phase 1** (Phase 2).

## 3. Architecture & file layout

```
src/physics.js          NEW  pure, DOM-free engine: numerical core + 7 synthesis models + buildable geometry IR
src/main.js             EDIT DOM wiring, dynamic field visibility, buildVba(geometry, design), download/copy
src/styles.css          EDIT styles for dynamic form + per-type metric rows
index.html              EDIT type selector (7 options), all inputs (type-gated), metrics panel
test/physics.test.mjs   NEW  Node zero-dep assertions (NOT copied into dist/)
package.json            EDIT add "test": "node --test test/" (or plain node script)
docs/superpowers/specs/ NEW  this spec
```

- `main.js` imports `physics.js` as an ES module (`import { synthesize, buildVba } from './physics.js'`).
  Browser-native ESM; works under `python -m http.server` and Vercel static hosting.
- `test/` lives at repo root so the `cp -R src dist/src` build never ships tests.

## 4. Geometry intermediate representation (IR)

Every model returns:

```js
{
  inputs:   { ...echoed required inputs... },
  metrics:  { ...named scalar outputs with units in the key or a unit map... },
  warnings: [ "string", ... ],          // e.g. "edge resistance < target; not matchable by inset"
  geometry: [ Primitive, ... ]
}
```

`Primitive` (all lengths in mm, origin at patch/antenna center, z = substrate normal):

```js
{ shape: 'box',      material, center:[x,y,z], size:{x,y,z} }
{ shape: 'cylinder', material, center:[x,y,z], radius, height, axis:'z' }   // solid disk when height≈t
{ shape: 'ring',     material, center:[x,y,z], rInner, rOuter, height, axis:'z' }
{ shape: 'segment',  material, ...disk with truncation/slot description for CP... }
material ∈ { 'substrate', 'pec', 'feed' }
```

- `buildVba(geometry, design)` maps primitives → CST `Brick` / `Cylinder` / ring (outer Cylinder
  minus inner) / `DiscretePort`.
- Phase 2 `buildScene(geometry)` maps the same primitives → Three.js meshes. **No model knows about
  either consumer.**

## 5. Numerical core (in `physics.js`)

Pure helpers, each unit-tested:

- `besselJ0(x)`, `besselJ1(x)` — power series `Jn(x)=Σ (-1)^m/(m!(n+m)!) (x/2)^(2m+n)`, converge for our args (x≲10); guard with term-magnitude break.
- `besselJ2(x)` — recurrence `J2 = (2/x)J1 − J0` (return 0 at x≈0).
- `neumannY0(x)`, `neumannY1(x)` — series with Euler γ and harmonic numbers (see §6.5).
- `Si(x)`, `Ci(x)` — Abramowitz-Stegun dual-region (Taylor for x<1.5; rational `f(x),g(x)` for x≥1.5).
- `simpson(f, a, b, n)` — composite Simpson (n even, default 100).
- `bisection(f, lo, hi, tol)` — sign-change root finder (+ a `scanForFirstRoot` helper).
- `newton(f, df, x0, tol)` — for the disk/CP probe match.

Constants: `C_MM_PER_NS = 299.792458`, `ETA0 = 376.730313`, `EPS0 = 8.8541878128e-12`,
`MU0 = 4πe-7`, `SIGMA_CU = 5.8e7`, `GAMMA = 0.5772156649`, `CHI11 = 1.841183`.

## 6. Antenna models

Shared inputs (where applicable): `frequencyGHz`, `substrateEr`, `substrateHeightMm`,
`lossTangent` (NEW, default 0.02), `conductorThicknessMm`, `portImpedance`.

### 6.1 Rectangular patch (`rectPatch`)
- `W = c/(2f)·√(2/(εr+1))`.
- εeff static (Hammerstad-Jensen): `εeff0 = (εr+1)/2 + (εr−1)/2·(1+12/u)^(−a(u)·b(εr))`, `u=W/h`,
  `a(u)=1 + (1/49)ln((u⁴+(u/52)²)/(u⁴+0.432)) + (1/18.7)ln(1+(u/18.1)³)`,
  `b(εr)=0.564·((εr−0.9)/(εr+3))^0.053`.
- Dispersion (Kirschning-Jansen): `εeff(f)=εr − (εr−εeff0)/(1+P(fn))`, **`fn = f_GHz · h_cm`
  (= `f_GHz · h_mm / 10`)** — the `P1..P4` constants are calibrated for f·h in GHz·cm; using mm
  gives a 10× overstated dispersion. `P=P1·P2·[(0.1844+P3·P4)fn]^1.5763` and the `P1..P4`
  coefficient formulas (VERIFIED — see §10).
- `ΔL = 0.412 h (εeff+0.3)(u+0.264)/((εeff−0.258)(u+0.8))`.
- `L = c/(2f√εeff(f)) − 2ΔL`.
- Edge resistance via Simpson integration of Balanis `I1`,`I12`:
  `I1=∫₀^π [sin((k0W/2)cosθ)/cosθ]² sin³θ dθ`, `I12` same × `J0(k0 L sinθ)`;
  `G1=I1/(120π²)`, `G12=I12/(120π²)`, `Rin0 = 1/(2(G1+G12))`.
- Inset: `y0 = (L/π)·arccos(√(Zin/Rin0))`, clamped to [0, L/2]; warn if `Zin>Rin0`.
- Q/BW: `Qd=1/tanδ`, `Qc=h/δs` (`δs=1/√(πf μ0 σ)`), `Qr=(πf εr ε0 W L)/(h·2(G1+G12))` form,
  `1/Qt=1/Qr+1/Qc+1/Qd`, fractional `BW=(S−1)/(Qt√S)` with S=2.
- Recommended ground: `Lg=L+6h`, `Wg=W+6h`. Conductor thickness `ΔW=(t/π)(1+ln(2h/t))` reported.
- Geometry: substrate box, ground box, patch box, feed.

### 6.2 Dipole (`dipole`)
- Induced-EMF impedance referred to current max (Balanis):
  `Rm=(η0/4π)[2Cin(k0L)+cos(k0L)(2Cin(k0L)−Cin(2k0L))+sin(k0L)(Si(2k0L)−2Si(k0L))]`,
  `Xm=(η0/4π)[2Si(k0L)+cos(k0L)(2Si(k0L)−Si(2k0L))−sin(k0L)(2Ci(k0L)−Ci(2k0L)−Ci(2k0a²/L))]`,
  `Cin(x)=γ+ln(x)−Ci(x)`. Input: `Zin = (Rm+jXm)/sin²(k0L/2)`.
- Resonant length: bisection on `X(L)=0` over `L∈[0.40λ0, 0.50λ0]` (seed with empirical
  `k≈0.485−0.075 e^(−0.85·log10(λ0/4a))`). Report arm `=L/2`, `R+jX`.
- Geometry: two `cylinder` arms (radius `a`) split by `feedGapMm`, feed across the gap.

### 6.3 Monopole (`monopole`)
- Image theory: solve the equivalent dipole of length `2h`; `height=L_res/2`, `Z=Z_dipole/2`.
- Finite circular-equivalent ground radius `Rg=√(groundL·groundW/π)`; optional ripple
  `R≈36.5+15·sin(2k0Rg)/(k0Rg)`, `X≈21.3−15·cos(2k0Rg)/(k0Rg)`.
- Geometry: radiator `cylinder` over ground `box`, feed-gap probe.

### 6.4 Circular disk patch (`circularDisk`)
- `F = 87.876/(f√εr)` (mm, GHz); physical radius
  `a = F/√(1 + (2h/(π εr F))(ln(πF/2h)+1.7726))`.
- Effective radius `ae = a√(1 + (2h/(π εr a))(ln(πa/2h)+1.7726))`; check `fr=87.876/(ae√εr)`.
- `Grad = (k0 ae)²/120 · ∫₀^{π/2} [J1'(z)² + cos²θ (J1(z)/z)²] sinθ dθ`, `z=k0 ae sinθ`,
  `J1'(z)=J0(z)−J1(z)/z`. **Denominator is `/120`, not `/480`** (VERIFIED — see §10; equivalently
  keep `/480` but use Balanis' `J0−J2`,`J0+J2` since `J0−J2=2J1'` and `J0+J2=2J1/z`).
- Cavity-loss conductances (Balanis Q-based, edge-referenced): with
  `C = ω0 ε0 εr π ae² (1−1/χ11²)/(2h)`, `δs=1/√(πf μ0 σ)`, `Qc=h/δs`, `Qd=1/tanδ`, then
  `Gc=C/Qc`, `Gd=C/Qd`. `Redge = 1/(Grad+Gc+Gd)`.
- Probe match (Newton-Raphson): solve `J1(kρ0)=J1(1.841183)·√(Zin/Redge)`, `k=1.841183/ae`,
  `ρ0=x/k`; **warn "not matchable by inward probe" if `Redge<Zin`**.
- Q/BW analogous to disk cavity. Recommended ground radius `a+4h`.
- Geometry: substrate box (or cylinder), ground box, patch `cylinder` (disk), probe feed at `(ρ0,0)`.

### 6.5 Annular ring patch (`annularRing`)
- Required input adds `ringRatio = b/a` (default 2.0).
- Neumann series:
  `Y0(x)=(2/π)[(ln(x/2)+γ)J0(x) − Σ_{k≥1} (−1)^k (x/2)^{2k}/(k!)² H_k]`,
  `Y1(x)=(2/π)[(ln(x/2)+γ)J1(x) − 1/x − ½ Σ_{k≥0} (−1)^k (x/2)^{2k+1}/(k!(k+1)!) (H_k+H_{k+1})]`,
  `H_k=Σ_{i=1}^k 1/i`, `H_0=0`.
- Characteristic eqn (TM11): root `x0=ka_eff` of
  `f(x)=J1'(x)Y1'(ρ x) − J1'(ρ x)Y1'(x)`, `J1'(x)=J0(x)−J1(x)/x`, `Y1'(x)=Y0(x)−Y1(x)/x`;
  found by scanning `[0.05, min(100, 20/(ρ−1))]` for first sign change → bisection.
- Synthesis: fringing `d=h/√εr`; iterate `ρeff` ↔ `aeff`:
  `aeff=(x0 c)/(2πf√εr)`, `ρeff=ρ+(ρ+1)d/aeff`, ~5 iterations; `a=aeff+d`, `b=ρa`.
- Feed `rf∈(a,b)` where cavity-field ratio gives `Rin=Zin`.
- Geometry: substrate box, ground box, patch `ring` (rOuter=b, rInner=a), probe feed at `rf`.

### 6.6 CP circular patch (`cpCircular`)
- Required input adds `polarization` (LHCP/RHCP). Reuse §6.4 radius synthesis for `a`, `Q`.
- Perturbation area ratio **`ΔS/S = 1/(2Q)`** (TO VERIFY — see §10); split freqs
  `f1,2=f0(1∓1/(2Q))`; AR 3dB bandwidth ≈ `0.348/Q`.
- Truncated-segments option (TWO symmetric segments, total `ΔS=S/(2Q)`): depth
  **`Δb=a·(3π/(16√2 Q))^{2/3}`** (VERIFIED — see §10; the `8√2` form puts `S/(2Q)` into *each*
  segment → total `S/Q`, double-perturbed). Slot option (single slot, area `S/(2Q)`):
  `Ls=a√(π/(2αQ))`, `Ws=αLs`, α≈0.1.
- Feed on the ±45° line (sign set by LH/RH) at `rf≈0.35a`.
- Geometry: patch `cylinder` (disk) with two truncation `segment`s (or a slot), probe at 45°.

### 6.7 UWB disc monopole (`discMonopoleUWB`)
- Required inputs: **`lowerCutoffGHz` (f_L)** (the frequency field is relabeled for this type),
  `feedGapMm`, ground dims. `εr/h/tanδ` optional (printed vs free-standing).
- Liang synthesis: `fL=7.2/(L+r+g)` GHz with `L=2r`, dims in cm → `r=((7.2/fL)−g)/3` cm.
  Equivalent cylinder radius `req=r/2`. Ground `Wg≥4r`, `Lg≥3r`.
- Reported as **broadband** (ratio BW often >10:1); "design frequency" = lower band edge.
- Geometry: disc `cylinder` (thin), ground `box` with feed gap `g`, feed probe across gap.

## 7. Dynamic UI

`index.html` `type` select gets 7 options. A small JS visibility map shows only the inputs each
type needs and the metrics each type produces; irrelevant rows are hidden (not shown as “—”).

| Type | Required inputs shown | Metrics shown |
|---|---|---|
| Rect patch | f, εr, h, tanδ, t, Zin | εeff, L×W, inset y0, Redge, Q, BW%, ground L×W |
| Dipole | f, wire radius, feed gap | arm length, R+jX, resonant f check |
| Monopole | f, wire radius, ground L×W, feed gap | height, R+jX |
| Circular disk | f, εr, h, tanδ, t, Zin | radius a, ae, probe ρ0, Redge, Q, BW%, ground radius, matchable? |
| Annular ring | f, εr, h, tanδ, ratio ρ, Zin | a, b, probe rf, Q, BW% |
| CP circular | f, εr, h, tanδ, polarization, Zin | radius a, truncation Δb / slot Ls, feed @45° rf, f1/f2, AR BW% |
| UWB disc monopole | **f_L**, feed gap g, ground L×W | disc radius r, req, ground W×L, note: broadband |

`render()` calls `synthesize(type, design)` → fills metric rows from `metrics`, surfaces
`warnings`, sets the VBA textarea from `buildVba(result.geometry, design)`.

## 8. CST VBA generation

`buildVba(geometry, design)` is geometry-driven:
- `box`→`Brick` (Xrange/Yrange/Zrange), `cylinder`→`Cylinder` (OuterRadius/axis/Zrange),
  `ring`→ outer `Cylinder` then inner `Cylinder` Boolean-subtract, `segment`→ disk + Boolean cut.
- `feed`→`DiscretePort` (P1/P2 from the primitive endpoints, `Impedance` = portImpedance).
- Header comments carry the design rationale: type, frequency, εeff/εr, key metrics (Redge, Q,
  BW, impedance), recommended ground, and any warnings.
- Material block uses `lossTangent` input (replaces hardcoded 0.02). Units mm/GHz/ns. Boundaries
  open. Solver frequency span: resonant types `[0.7f,1.3f]`; disc monopole `[fL, 12·fL]` (broadband).

## 9. Verification plan (`test/physics.test.mjs`, Node, zero-dep)

All reference values below were **independently derived and cross-checked against Abramowitz-Stegun,
Balanis, and Garg** by a verification workflow (8 agents, each with its own Node re-implementation).
These are the assertion set.

**Numerical core** (tol):
- `Si(π/2)=1.37076`, `Si(π)=1.85194`, `Ci(1)=0.33740`, `Ci(2)=0.42298`, `Cin(2π)=2.43765` (1e-4).
- `J0(0)=1` (1e-12), `J0(2.40483)≈0` (1e-5), `J1(1.84118)=0.581865` (1e-5), `J2(3)=0.486091` (1e-5).
- `Y0(1)=0.088257`, `Y1(1)=−0.781213`, `Y0(2)=0.510376`, `Y1(2)=−0.107032` (1e-5).

**Dipole / monopole** (tol):
- Thin half-wave dipole (L=0.5λ0, a=1e-4·λ0): `Zin = 73.08 + j42.52 Ω` (±0.5 Ω each).
- Half-wave `Rr = 30·Cin(2π) = 73.13 Ω` (±0.1 Ω).
- Resonant dipole (f=300 MHz, a=1mm): `L_res/λ0 = 0.4775` (±0.005), `R = 63.98 Ω` (±1 Ω), `X≈0`.
- Quarter-wave monopole (image, a=1mm): `Z = 31.99 + j0 Ω` (±0.5 Ω) = ½ the dipole R.

**Rect patch** (εr=4.4, h=1.6mm, f=2.4GHz) (tol):
- `W=38.010 mm` (0.05), `εeff0=4.0431` (0.01), `εeff(f)=4.0498` (0.01) **[KJ with fn=f·h_cm=0.384]**,
  `ΔL=0.737 mm` (0.01), `L=29.56 mm` (0.2, acceptance window 28–30 mm).
- `I1=1.14798` (1e-3); `G1=9.69285e-4 S` (1e-6); `I12`/`G12` evaluated at the corrected
  resonant length `L`: `G12=5.8283e-4 S` (2e-6), `Rin0=322.14 Ω` (2).

**Circular disk** (εr=4.4, h=1.6mm, f=2.4GHz, Zin=50) (tol):
- `F=17.4555 mm` (0.05), `a=16.945 mm` (0.05), `ae=17.467 mm` (0.05), `fr_check=2.3984 GHz` (0.005).
- radiation integral `I=0.24494` (1e-3); `Grad=1.5757e-3 S` **[/120 form]** (1e-5);
  `Gc=1.046e-4 S`, `Gd=2.4813e-3 S` (1e-5); `Redge=240.29 Ω` (2); probe `ρ0=5.233 mm` (0.05).

**Annular ring** (εr=4.4, h=1.6mm, f=2.4GHz, ρ=2) (tol):
- first TM11 root `x0=0.677336` (1e-4); `a=6.458 mm`, `b=12.916 mm` (0.01), `b/a=2.000`.

**CP circular** (Q=50, a≈17mm) (tol):
- `ΔS/S=1/(2Q)=0.01`; split `(f2−f1)/f0=1/Q=0.02` (1e-4); split-mode phase `−90°` (0.5°),
  amplitude ratio `1.000`; AR-3dB BW coeff `0.347` (BW≈0.348/Q); truncation `Δb=0.699 mm`
  **[16√2 form]** (0.01); slot `Ls=9.529 mm`, `Ws=0.953 mm` (0.01).

**UWB disc monopole** (f_L=3.1GHz, g=0.3mm) (tol):
- `r=7.642 mm` (0.01), `req=r/2=3.821 mm` (0.01), `Wg≥30.57 mm`, `Lg≥22.93 mm`;
  back-check `fL=7.2/(3r+g)=3.100 GHz` (0.001).

**Robustness:** every type — `synthesize()` returns finite metrics + non-empty geometry; blank/invalid
inputs degrade gracefully (no NaN/Infinity reaching VBA). Plus `node --check src/main.js src/physics.js`
and a DOM-stubbed smoke test rendering all 7 types.

## 10. Verification status (resolved by the 2026-06-29 verification workflow)

All three flagged items are now **resolved and folded into §6** above:

1. **CP perturbation factor — RESOLVED: `ΔS/S = 1/(2Q)` confirmed** (Garg / Sharma-Gupta), three
   ways: split `(f2−f1)/f0=1/Q`, exact ±90°/equal-amplitude quadrature at f0, and the slot area
   `Ls·Ws=S/(2Q)`. The `1/Q` figure is wrong. *Additional* fix found: the two-segment truncation
   depth must use `16√2` (not `8√2`) to avoid double-counting — applied in §6.6.
2. **Rect patch KJ dispersion — FIXED:** `fn = f_GHz·h_cm` (not `h_mm`); 10× error corrected in §6.1.
3. **Circular disk Grad — FIXED:** denominator `/120` with the `J1'` integrand (was 4× too small);
   corrected in §6.4, plus explicit `Gc/Gd` cavity-loss formulas added.
4. **Annular fringing** uses first-order `d=h/√εr`; the ρ=2 root (`x0=0.6773`) and radii verified
   physical, so retained.

Everything else verified correct as written. Per the workflow's verdict: *"the spec's physics is
fundamentally sound and ready to implement"* with the above applied.
3. **Disc-monopole Liang constant** `7.2` (cm·GHz) — sanity-check r at f_L=3.1 GHz ≈ 7–8 mm.

## 11. Phase 2 interface (forward-looking, not built this phase)

Phase 2 consumes `result.geometry` via `buildScene(geometry)` → Three.js meshes
(`box`→BoxGeometry, `cylinder`→CylinderGeometry, `ring`→RingGeometry/Tube, `segment`→lathe/CSG),
color-coded by `material`, OrbitControls for rotate/zoom/pan, rebuilt on each `render()`. Phase 1
must keep `geometry` complete and self-describing enough to render without recomputation.

## 12. Risks / open questions

- Power-series Bessel/Neumann lose precision for large args; our arguments stay small (≲10) — guard
  with term-magnitude break and assert in tests.
- Annular characteristic function is singular as x→0 (Neumann divergence); scan starts at x=0.05.
- CP single-feed perturbation formulas are approximate; treated as starting points (consistent with
  the tool's "refine in CST" purpose).
