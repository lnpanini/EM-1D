# EM-1D Serpentine Loop Antenna — Design Spec (Type 8)

**Date:** 2026-07-19
**Status:** Approved (design + live shape preview); pending spec review
**Builds on:** Phase 1 synthesis engine (`2026-06-29-circular-antenna-synthesis-design.md`) and Phase 2 viewer (`2026-06-29-3d-viewer-phase2-design.md`)

---

## 1. Context & goals

Add an **8th antenna type** — a **serpentine (meander) loop** — to the existing synthesis engine,
at full parity with the current 7 (physics + metrics + KPIs + 3D viewer + CST VBA export).

The radiator is a closed copper **ribbon** of constant width `w` whose centerline follows the
user-supplied parametric curve, broken by a small **feed gap** with a discrete port across it:

```
x(t) = (R + A·sin n t)·cos t + S·sin 2n t·sin t
y(t) = (R + A·sin n t)·sin t − S·sin 2n t·cos t        0 ≤ t ≤ 2π
```

`R` = base radius, `A` = radial undulation amplitude, `n` = number of undulations, `S` = the
serpentine "kink" amplitude (the `sin 2n t` term that makes each lobe S-shaped rather than a plain
scallop). The source instance is `n=25, A/R=0.20, S/R=0.05`. **Default `n` is 12, not 25:** sizing the
`n=25` curve to resonate at 2.45 GHz shrinks the loop to a ~2.8 mm base radius, packing the fingers
tighter than any trace width (inter-finger gaps ~0.17 mm) so the ribbon self-intersects. `n=12` is the
largest count that stays buildable with a 1 mm trace at 2.45 GHz (footprint ~13.4 mm). Users can still
enter `n=25` and get a self-overlap warning. (Meander loops are a low-frequency miniaturization
technique — high `n` belongs at sub-GHz, where the loop is physically larger.)

Physically this is a **resonant one-wavelength loop**: the undulations pack a full guided wavelength
of conductor into a compact footprint. Synthesis is first-order/closed-form (one numerical integral),
consistent with the engine's philosophy — a fabrication *starting point*; CST does the full-wave.

The board is **FR-4 by default** (εr 4.4, h 1.6 mm, tanδ 0.02 — all editable; εr=1 gives free space),
reusing the engine's existing substrate fields. A **ground-plane toggle** lets the user export the loop
two ways, each **re-solved to resonate for its own stackup**:

- **Full ground** *(default)* — copper ground under the FR-4; the trace is a grounded microstrip, so
  `εeff` uses the microstrip value. **Radiation caveat:** at h≈1.6 mm the ground sits ~0.013λ behind
  the loop, largely cancelling its radiation — this is the resonator/comparison case, flagged with a
  warning, not the efficient radiator.
- **No ground** — bare printed loop on FR-4 (or air); `εeff = (εr+1)/2`. This is the true 1λ radiator.

**Goals**

1. One new synthesis model `serpentineLoop(design)` in `physics.js`.
2. One new geometry IR primitive — `trace` (a swept constant-width ribbon) — consumed by both
   `scene.js` (viewer) and `buildVba()` (CST), with **no model aware of either consumer**.
3. A `groundPlane` control that changes the stackup, the `εeff`/sizing, and the CST export together.
4. Register the type across the UI (picker glyph, type-gated fields, KPIs/readout/results, compare).
5. Honest metrics only; no invented cavity-Q/bandwidth (a loop doesn't fit the patch cavity model).

## 2. Non-goals / scope guardrails (YAGNI)

- No full-wave / MoM solver; no frequency-response / S-parameter plot; no closed-form input reactance
  (loop `X` and the true grounded-loop resonance need full-wave).
- No runtime dependencies; no build-system change (`cp`-based build, `python -m http.server` dev).
- No general spline/path editor — geometry is driven solely by `(n, A/R, S/R, w)` + `f₀` + stackup.
- Only two ground configurations (full / none); no finite/partial ground, no coplanar ground ring.
- The absolute `R = 4` from the source equation is a modeling unit; the built type **solves `R` from
  `f₀` and the stackup** so the loop is a physical resonator. The *shape* is scale-invariant, so it
  reproduces the equation exactly regardless of the resulting physical size.

## 3. Architecture & file layout

```
src/physics.js          EDIT  + serpentineLoop(); + 'serp' in TYPES + dispatcher case + SUBSTRATE_TYPES;
                              + 'trace' handling in buildVba (new vbaExtrudePolygon helper)
src/scene.js            EDIT  + one branch: 'trace' → { kind:'shape', outline } (bounds already cover 'shape')
src/main.js             EDIT  + FIELDS (undulations, ampRatio, serpRatio, traceWidthMm, groundPlane);
                              + TYPE_FIELDS.serp; + VIEW.serp; + GLYPH.serp; + compare-view cases
src/styles.css          EDIT  + .g-serp glyph
test/physics.test.mjs   EDIT  + serpentine assertions (§9)
test/scene.test.mjs     EDIT  + 'trace' → 'shape' spec assertion
docs/superpowers/specs/ NEW   this spec
```

**No change to `viewer.js`** — `trace` renders through the existing `kind:'shape'` path
(`THREE.ShapeGeometry`, flat filled polygon in the x-y plane), exactly as the CP `segment` does.
The substrate slab and ground plane reuse the existing `box` primitive → CST `Brick`, so the only new
CST emitter is the polygon extrude for the ribbon.

## 4. Geometry IR extension — the `trace` primitive

One new primitive is added to the IR (all lengths mm, origin at loop center, z = board normal):

```js
{ shape: 'trace', material: 'pec', outline: [[x,y], …], center: [0,0,z], thickness }
```

- `outline` is a **single closed, non-self-intersecting polygon** — the constant-width ribbon.
  Because the feed gap breaks the loop, the ribbon is a simple curved *strip* (topological disk),
  **not** an annulus: no hole, no Boolean subtract needed anywhere downstream.
- `scene.js`: `trace` → `{ kind:'shape', outline, pos:[...center], ...materialStyle }`.
  `sceneBounds` already grows over `kind:'shape'` outline points — no change there.
- `buildVba()`: `trace` → one extruded-polygon solid (§8).

Substrate and ground reuse the existing `box` primitive; the feed reuses the existing
`{ shape:'feed', material:'feed', p1, p2, impedance }` (a short line bridging the two ribbon ends).

## 5. Synthesis math (`serpentineLoop`)

Let `a = A/R` (`ampRatio`), `s = S/R` (`serpRatio`), `n` integer. On the **unit curve** (R=1):

```
x̂(t) = (1 + a·sin n t)·cos t + s·sin 2n t·sin t
ŷ(t) = (1 + a·sin n t)·sin t − s·sin 2n t·cos t
```

**Step 1 — effective permittivity (stackup-dependent).** `h = substrateHeightMm`, `w = traceWidthMm`:

```
groundPlane = 'Full'  (microstrip, Hammerstad):
    εeff = (εr+1)/2 + (εr−1)/2 · (1 + 12 h/w)^(−1/2)
groundPlane = 'None'  (printed strip at interface):
    εeff = (εr > 1) ? (εr+1)/2 : 1
```

**Step 2 — guided wavelength.** `λ0 = C_MM_PER_NS / f₀` (mm); `λg = λ0 / √εeff`.

**Step 3 — shape factor (one integral).** Total unit-curve length
`G = ∮₀^{2π} √(x̂'² + ŷ'²) dt`, by composite `simpson()` with `N = max(4000, 120·n)` (even).
Closed-form derivatives (with `u = 1 + a sin n t`, `u' = a n cos n t`):

```
x̂' = u'·cos t − u·sin t + s·(2n·cos 2n t·sin t + sin 2n t·cos t)
ŷ' = u'·sin t + u·cos t − s·(2n·cos 2n t·cos t − sin 2n t·sin t)
```

**Step 4 — resonant size.** The whole curve scales linearly with `R`, so `L_path = R·G`. A
one-wavelength loop resonates at `L_path = λg`:

```
R = λg / G        A = a·R        S = s·R
```

Because `εeff(Full) > εeff(None)`, the grounded loop is **smaller** (e.g. R 2.76 vs 2.95 mm on FR-4).
Toggling the ground re-solves `R` — the two exports are each self-consistent (per user decision).

**Step 5 — footprint & figures of merit.**

```
outerR      = R + A
footprintD  = 2·outerR + w
L_path      = R·G           (= λg by construction — a solve self-check)
meander     = G / (2π)      (conductor length ÷ base-circle circumference)
plainLoopD  = λg / π        (diameter of an equivalent plain 1λ loop, same stackup)
miniaturize = plainLoopD / footprintD
Rrad        ≈ 100 Ω         (1λ-loop estimate; reported only for groundPlane='None')
```

No `X`, no `Q`, no `bandwidthPct` — those require full-wave and are deliberately omitted.

**Warnings:** clamp `n` to an integer ≥ 4 (warn if coerced); warn "trace may self-overlap — reduce
width or undulations" when the closest approach between centerline samples **more than half an
undulation apart** (different strands, not the same finger) is < `w` — the check must skip within-finger
neighbors or it measures the wrong distance and misses moderate-`n` overlaps; warn
if the feed-gap half-angle δ (§6) ≥ π/n; and — when `groundPlane='Full'` — warn "full ground ≈h behind
the loop suppresses radiation; grounded loop behaves as a resonator, not an efficient 1λ radiator."

## 6. Model output & geometry generation

`serpentineLoop(design)` returns the standard `{ inputs, metrics, warnings, geometry }`.

**metrics:** `{ R, A, S, outerR, footprintD, Lpath, G, meander, eeff, lamg, plainLoopD, miniaturize,
Rrad, n, grounded, feedGap }` (`Rrad` is `null` when grounded; `grounded` is a boolean).

**geometry build** (trace on top; substrate below; ground under substrate):

1. Feed-gap half-angle `δ = g / (R · ŝ0)`, `ŝ0 = √(x̂'(0)² + ŷ'(0)²)`; sample the **open** centerline
   for `t ∈ [δ/2, 2π − δ/2]` at `M+1` points, `M = max(720, 16·n)`, using real `R, A, S`.
2. Per-vertex unit normal from the central-difference tangent; offset each point by `±w/2` →
   `left[]`, `right[]`. Ribbon polygon = `left[0..M]` then `right[M..0]` (closed).
3. Emit primitives (conductor thickness `t = conductorThicknessMm || 0.035`; ground copper `tg = t`;
   slab/ground span `span = footprintD + 6h`):
   - `{ shape:'trace', material:'pec', outline, center:[0,0,t/2], thickness: t }`   (conductor mid-plane, like
     `segment`; solid spans z = 0..t, sitting on the substrate top — the flat viewer plane at z=t/2 clears the
     substrate face so it doesn't z-fight. `buildVba` extrudes from `center[2] − t/2`.)
   - if `εr > 1`: `{ shape:'box', material:'substrate', center:[0,0,−h/2], size:{x:span,y:span,z:h} }`
   - if `groundPlane='Full'`: `{ shape:'box', material:'pec', center:[0,0,−h−tg/2], size:{x:span,y:span,z:tg} }`
   - `{ shape:'feed', material:'feed', p1:[…spine start,0], p2:[…spine end,0], impedance: Zin }`
     — a series port across the gap at `(≈R, 0)`, identical in both configs (so a with/without-ground
     comparison keeps the same excitation).

## 7. Dynamic UI

**New `FIELDS`** (defaults are the locked reference design):

| key | label | sym | unit | default |
|---|---|---|---|---|
| `undulations` | Undulations | n | — | 12 |
| `ampRatio` | Undulation depth | A/R | — | 0.20 |
| `serpRatio` | Serpentine kink | S/R | — | 0.05 |
| `traceWidthMm` | Trace width | w | mm | 1.0 |
| `groundPlane` | Ground plane | — | — | select `['Full','None']` (default **Full**) |

Reused existing fields (FR-4 defaults already correct): `frequencyGHz` (2.45), `substrateEr` (4.4),
`substrateHeightMm` (1.6), `lossTangent` (0.02), `feedGapMm` (1.0), `portImpedance` (50).

**`TYPE_FIELDS.serp`** (grouped): `frequencyGHz` · `undulations, ampRatio, serpRatio, traceWidthMm` ·
`substrateEr, substrateHeightMm, lossTangent, groundPlane` · `feedGapMm, portImpedance`.

**`serp` added to `SUBSTRATE_TYPES`** so `synthesize()` enforces `εr ≥ 1` and `h > 0` (the microstrip
`εeff` needs `h`).

**`VIEW.serp`:**
- `readout`: `R`, `Ø` (footprintD)
- `kpis`: **Footprint Ø · mm** (lead), Conductor · mm (`Lpath`), Meander · × (`meander`)
- `results`: Base radius R · mm; Guided λg · mm; Effective εeff; Ground plane (Full / None);
  Miniaturization ×; Undulations n; Rad. resistance ≈ Ω (est, `—` when grounded); Feed gap · mm

**`GLYPH.serp = 'g-serp'`** — a new `.g-serp` scalloped-ring glyph in `styles.css`, drawn in the dark
glyph box like the others.

**Compare view + badge:** add `serp` to `mainSize` (`Ø <footprintD> mm`) and `edgeOrZ`
(`Full`/`None` ground, or `≈ <Rrad> Ω` when ungrounded); the substrate badge reads `FR-4` at εr≈4.4,
`air` at εr=1, else `εr <value>` (existing logic, since `serp` uses `substrateEr`). `Bandwidth`,
`Q factor`, `AR bandwidth` rows fall through to `—`; `Polarization` → `linear`.

## 8. CST VBA generation

`buildVba()` is already geometry-driven for `box`/`feed`; it gains a `trace` branch backed by a new
helper `vbaExtrudePolygon(name, comp, material, outline, z, height)`:

```
With Extrude
  .Reset
  .Name "trace_i" : .Component "component1" : .Material "PEC"
  .Mode "Pointlist"
  .Height <thickness> : .Twist 0.0 : .Taper 0.0
  .Origin 0, 0, <z> : .Uvector 1, 0, 0 : .Vvector 0, 1, 0
  .Point  x0, y0
  .LineTo x1, y1
  …                              ' one .LineTo per outline vertex
  .Create
End With
```

- `substrate` box → existing `Brick` with `substrate` material; `pec` boxes (ground) → `Brick` PEC.
  The `substrate` material block (`Epsilon`=εr, `TanD`=tanδ) is already emitted when any primitive has
  `material:'substrate'` — no change. `feed` → existing `vbaDiscretePort`.
- Header comments carry type, `f₀`, εeff, stackup (FR-4/air), ground (Full/None), and the key metrics
  (R, footprint, L_path, meander, miniaturization, Rrad est / grounded) plus any warnings.
- Boundaries open; solver span `[0.7 f₀, 1.3 f₀]`.
- The outline may hold ~700 points; emit as-is (CST handles it). Optional max-deviation decimation to
  ≤400 points if macro size becomes a concern (not required for correctness).

## 9. Verification plan (`test/physics.test.mjs`, `test/scene.test.mjs` — Node, zero-dep)

Reference values from an independent Node re-implementation of §5 (match the live preview):

**Shape factor / integrator:**
- Plain circle `G(a=0, s=0) = 2π = 6.283185` (1e-4) — validates the arc-length integrator.
- `G(n=25, A/R=0.20, S/R=0.05) = 25.2668` (1e-3); no-kink `G(n=25, 0.20, 0) = 21.4111` (1e-3).

**Effective permittivity (FR-4, h=1.6, w=1.0):**
- microstrip `εeff(Full) = 3.0782` (1e-3); interface `εeff(None) = 2.700` (1e-3).

**Default design — Full ground, FR-4 (f₀=2.45, n=25, A/R=0.20, S/R=0.05, w=1.0):**
- `λg = 69.743 mm` (2e-2); `R = 2.7603 mm` (1e-2); `footprintD = 7.6247 mm` (2e-2).
- **Solve self-check:** `L_path = R·G = λg` to 1e-6.

**No ground, FR-4:** `R = 2.9473 mm`, `footprintD = 8.0735 mm` (1e-2/2e-2).
**No ground, air (εr=1):** `εeff=1`, `R = 4.8429 mm`, `footprintD = 12.6229 mm` (1e-2/2e-2).

**Scale invariance:** `footprintD / λ0` identical for `f₀ = 1` and `f₀ = 5` GHz at fixed stackup (1e-6).

**Geometry / IR:**
- `groundPlane='Full'` on FR-4 → geometry has exactly one `trace`, one `substrate` box, one `pec`
  ground box, one `feed`. `groundPlane='None'` → no ground box. `εr=1` → no substrate box.
- `trace.outline` is a closed polygon of `2·(M+1)` vertices, no self-intersection at default width.
- **Warning state:** the buildable default (`n=12`, `w=1.0`, 2.45 GHz) emits **no** self-overlap
  warning; `n=25` **does**; and a moderate overlap case (`n=14`) also does — this last assertion guards
  the closest-approach heuristic against the full-period-offset bug that would miss it.
- `scene.test`: `trace` → exactly one `{ kind:'shape' }` spec; `sceneBounds` finite, spans `≈ footprintD`.

**Robustness:** `synthesize('serp', …)` returns finite metrics + non-empty geometry; degenerate inputs
(n<4, w=0, f₀≤0, h≤0) degrade gracefully with a warning and no NaN/Infinity reaching VBA. Plus
`node --check` and the DOM-stubbed smoke test rendering all **8** types.

## 10. Risks / open questions

- **Undulation count vs frequency (feasibility)** — high `n` at high `f₀` is geometrically impossible:
  the resonant loop shrinks faster than the fingers can be spaced. Default `n=12` is buildable at
  2.45 GHz; `n=25` needs sub-GHz to be manufacturable. Surfaced via the self-overlap warning, not
  blocked — the user may knowingly explore. (Decided: default `n=12`, keep `n` free.)
- **Full-ground radiation suppression** — physically real and the whole point of the warning: a loop
  ~0.013λ above ground barely radiates. Kept as an exportable configuration (per user request) with an
  explicit warning; `Rrad` est is withheld when grounded. (Decided.)
- **`εeff` models** — Hammerstad microstrip (grounded) and `(εr+1)/2` interface (ungrounded) are both
  first-order quasi-static estimates; adequate for a synthesis starting point, refined in CST. (Decided.)
- **Series gap port under a ground** — kept identical to the ungrounded case for clean A/B comparison;
  a probe-to-ground feed is a valid alternative a CST user can substitute. (Decided: gap port.)
- **Self-overlap at high `n` / wide `w`** — warned, not blocked; the user may explore tight geometries.
- **VBA point count** — large but within CST limits; decimation available if needed (§8).
