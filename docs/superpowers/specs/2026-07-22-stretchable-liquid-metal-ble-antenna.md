# Stretchable Liquid-Metal BLE Loop — Design Refinement & CST Validation

**Date:** 2026-07-22
**Status:** RF design validated in CST (free space); on-body (skin) analysis in progress
**Builds on:** `2026-07-19-serpentine-loop-antenna-design.md` (Type 8, the etched serpentine loop)
**Application:** 2.44 GHz BLE antenna on a flexible, stretchable kinetic tape — PDMS cast with a
dissolvable-core channel, back-filled with EGaIn liquid metal.

---

## 0. TL;DR for the report

A serpentine (meander) loop was extended from a rigid etched trace into a **stretchable liquid-metal
channel embedded in PDMS**, then hardened for parametric CST export and validated by full-wave
simulation. Headline results, free space:

| Quantity | Value | Source |
|---|---|---|
| Target band | 2.400–2.4835 GHz (BLE) | requirement |
| Resonance (tuned) | **2.44 GHz, S₁₁ = −24 dB** | CST FD, tetrahedral |
| Radiation efficiency | **≈ 90 % (−0.47 dB)** | CST far-field |
| Total efficiency | **≈ 81 % (−0.9 dB)**, →~88 % when centred | CST far-field |
| Footprint | ≈ 23 mm (⌀), `serp_R ≈ 11.5 mm` | CST-tuned |
| Conductor | EGaIn, ⌀0.5 mm channel | design |
| Substrate | PDMS (εr 2.68, tanδ 0.02), ≤ 3 mm total | fabrication constraint |
| Strain stability | Δf₀ < 0.2 % to 20 % strain (with z-wave) | kinematic model |

The single most important correction the simulation forced: **ε_eff is ≈ 1, not 2.68** — a thin PDMS
slab barely loads the loop, so the fabricated antenna is ~2× larger than first predicted (§4.1).

---

## 1. The arc of the work

This document covers four stages, in the order they happened. Each stage produced a real correction
to either the tool or the design; the errors are recorded deliberately because the *reasons* are the
useful part for a write-up.

1. **CST export hardening** — making the exported VBA a valid, *parametric*, sweep-ready macro (§2).
2. **Feed topology** — discovering the grounded closed loop is non-matchable, and why (§3).
3. **Stretchable pivot** — the liquid-metal / PDMS physics, and why the strain relief must be
   *out of plane* (§4).
4. **CST full-wave validation** — mesh, the ε_eff correction, resonance tuning, efficiency (§5).

---

## 2. CST parametric export — seven things that had to be right

The original goal was to turn the hardcoded VBA dump into a parametric, sweep-ready macro. Seven
distinct issues surfaced (most only visible once the macro actually ran in CST 2026 LE):

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `(&H8000ffff) do not mix old…with new` | `DiscretePort` emitted **both** `SetP1/SetP2` **and** legacy `UsePickedPoints` | `SetP1/SetP2` only |
| 2 | model imports "incomplete" | consequence of #1 — macro aborts at the port, the last step | (fixed by #1) |
| 3 | not parametric | geometry built with bare `.Create` → orphan solids | wrap **everything** in `AddToHistory` |
| 4 | huge blocks won't compile | VBA caps line-continuations at 24/statement | `h = h & "…"` accumulator form past ~12 lines |
| 5 | `Invalid parameter name 'space'` | `space` shadows VBA's `Space()` builtin | rename → `bg_space`; guard all names vs VBA/Python keywords |
| 6 | `Shape does not exist: Serpentine` | `Solid.Subtract` operands reversed — CCW curve's left normal points **inward**, so the "outer" ring was actually the hole | swap: outer = right offset, hole = left offset |
| 7 | port too close to open boundary | no vacuum padding; PML sat in the reactive near field | add `bg_space = λ₀/4` background on all six faces |

**Key principle (worth a slide):** *In CST the History List **is** the model.* A macro that calls
`Brick.Create` directly builds a solid that is an orphan — it renders but no parametric rebuild can
touch it. Parametric = named parameters (`StoreDoubleParameter`) **plus** history entries that
reference those names as **quoted expression strings** (`.Xrange "-sub_x", "sub_x"`). A literal number
in a history entry is inert no matter how many parameters sit beside it.

### 2.1 Generating a curve *inside* the macro

The serpentine trace is a ~1440-point offset polygon. Naming parameters next to 1440 literal `.LineTo`
lines would be theatre — sweeping `serp_R` couldn't move a single point. So the **curve evaluator
itself is emitted as the body of a history block**: it calls `RestoreDoubleParameter`, regenerates the
polygon in a VBA loop, and rebuilds on every history replay. That is what makes `serp_R`, `amp_ratio`,
`serp_ratio`, `serp_n`, `trace_w` genuine Parameter-Sweep / Optimizer variables. The macro stays ~300
lines instead of ~1500.

A test asserts the VBA-side curve math reproduces the JS IR outline to < 1e-13 mm, so the two
implementations can't silently diverge (`test/physics.test.mjs`).

---

## 3. Feed topology follows the ground plane

An early grounded run produced a **flat S₁₁ near 0 dB across the whole band** — total reflection, no
resonance. This is not a tuning problem; it is structural.

A **closed loop tapped at one point** is two arms of L/2 in parallel joined at an open far node:

```
Z_in = −j (Z₀/2) cot(β L/2)          ← purely reactive at every frequency  ⇒  |Γ| = 1
```

A lossless reactance reflects everything, so S₁₁ = 0 dB by construction. The only real part would come
from radiation, which a full ground plane 1.6 mm behind the loop suppresses. This is why the classic
microstrip ring resonator is fed through a **coupling gap**, never a direct tap.

The resolution — the `groundPlane` toggle now selects two physically different antennas, recorded in
`metrics.feedType`:

| | `None` → `delta-gap` | `Full` → `microstrip-edge` |
|---|---|---|
| Structure | free-standing 1λ loop | microstrip resonator over ground |
| Loop | **open** at the feed gap | **closed** galvanically (an annulus) |
| Feed | balanced source across the gap | 50 Ω line from `microstripWidth()` to the board edge |
| Port | both terminals in the conductor plane | vertical: top conductor → ground plane |
| Return path | — (balanced) | **the ground plane** |

A delta-gap source floating in the trace plane over a ground plane has no return path and excites the
structure unphysically — hence the ground plane *is* one of the port terminals in the microstrip case.

> Note for a body-worn design: the **ungrounded delta-gap loop is the one that matters** — it needs no
> counterpoise (nothing has to serve as a stretching ground plane), and it is the topology carried
> into the liquid-metal work below.

---

## 4. The stretchable pivot — liquid metal in PDMS

The antenna is not etched copper on a rigid board; it is EGaIn injected into a PDMS-cast channel on a
tape that stretches. That changes three things: the conductor, the strain mechanism, and ε_eff.

### 4.1 ε_eff — the correction the simulation forced

The synthesis first assumed an **embedded** conductor sees dielectric on all sides, so `ε_eff = εr =
2.68` (bulk loading, the maximum case). This predicted `R = 4.38 mm`, footprint 11 mm.

**CST said otherwise.** The 4.38 mm loop resonated near 5 GHz, not 2.44. The reason:

> `ε_eff = εr` holds only for a conductor in *infinite bulk* dielectric. A ≤ 3 mm PDMS slab around a
> loop that is 10–20 mm across does **not** provide bulk loading — a loop's fields extend roughly its
> own diameter, so most of the field lives in **air**. The real `ε_eff` collapses toward **≈ 1**.

Consequence: the antenna is **~2× larger** than the bulk-εr prediction (`serp_R ≈ 11.5 mm`, footprint
~23 mm). The final ε_eff sits between 1.0 (surface / thin tape) and 2.68 (thick bulk encapsulation)
and depends on how much PDMS surrounds the channel — a **fabrication decision that sets antenna size**.
Practical takeaway: **tune size empirically in CST**, do not trust a closed-form ε_eff for this regime.

### 4.2 Conductor — EGaIn loss is real but small

EGaIn conductivity σ ≈ 3.4 × 10⁶ S/m, ~17× worse than annealed copper. But an injected ⌀0.5 mm channel
has far more surface area than rolled foil, and skin-effect loss scales with perimeter:

```
R_loss = R_s · (L / perimeter),   R_s = √(π f μ₀ / σ)
```

Result: **conductor efficiency ≈ 98 %** vs copper's 99.5 %. The conductivity penalty is *not* where
efficiency is lost — do not over-engineer the metal.

### 4.3 Strain — why the in-plane serpentine buys nothing

The instinct behind the serpentine was strain relief (horseshoe interconnects in stretchable
electronics). But that mechanism **requires a stiffness contrast**: stiff copper meanders *unfold*
instead of stretching, so the arc length stays constant. **Liquid metal has no stiffness.** The channel
is a void in the elastomer and deforms **affinely** with it.

Quantified (unit loop, 20 % uniaxial strain, Poisson 0.5):

| | serpentine | plain circle |
|---|---|---|
| Δ(perimeter) @ 20 % strain | **5.54 %** | 5.54 % |

They are **identical**. Since a loop's resonance ∝ 1/perimeter, a bonded liquid-metal serpentine
detunes by ~5.5 % at 20 % strain — past the ±1.71 % BLE budget beyond ~7 % strain. The in-plane
meander gives **no** length-invariance. (It still earns its place: 2.14× miniaturization, and it
spreads strain so the channel doesn't pinch off locally.)

### 4.4 The fix — out-of-plane (z) strain compensation

A channel that also undulates in **z** works *without* any stiffness contrast:

```
z(t) = a · sin(m_z · t)          added to the in-plane serpentine centreline
```

PDMS is near-incompressible (ν ≈ 0.5), so in-plane stretch **compresses z**, which **flattens** the
wave and releases arc length at close to the rate the perimeter demands it. The compensation is built
into the affine transform itself.

**Result (kinematic model):** there is a scale-invariant optimum

```
a / λ_z ≈ 0.183      (λ_z = in-plane path length per z cycle)
```

independent of `m_z` (verified across m_z = 24…96). At the optimum, **Δf₀ < 0.2 % out to 20 % strain**
— a ~30–50× improvement over the flat channel, comfortably inside the BLE budget.

Because the z-wave adds ~28 % arc length, the loop shrinks ~22 % for the same electrical length.
Implemented as `serpArc3D()`, `serpZDrift()`, `solveSerpZRatio()` in `physics.js`.

**Caveat:** this is an *affine kinematic* model — it assumes the channel centreline follows the bulk
PDMS. A void is a compliance discontinuity, so validate with FEA or a printed coupon before committing.

### 4.5 Geometry & CST export for the embedded channel

- New IR shape `tube` — a swept circular section along a 3D centreline. Consumed by `scene.js`
  (Three.js `TubeGeometry`), `drawings.js` (top/section SVG), and `buildVba()`.
- CST export uses `Polygon3D` + `Wire`/`CurveWire` (the only vocabulary for an out-of-plane path),
  with the z-wave **generated in-macro** from `z_amp`, `z_cyc` — same RestoreDoubleParameter pattern.
- The slab auto-thickens to bury the ±`z_amp` envelope; a warning fires if it exceeds `substrateHeightMm`.
- **Tight-curvature limit:** a swept tube self-intersects where the centreline radius of curvature
  (`1/(a·k²)` at a z-crest) drops below the tube radius. At `m_z = 48` on a ⌀0.5 mm channel this is
  marginal (CST: "difficult geometric condition… handled"). Fixes if it bites: fewer `z_cyc`, or a
  thinner channel. Larger loops relax it automatically (λ_z grows → gentler bends).

---

## 5. CST full-wave validation (Frequency Domain, tetrahedral)

### 5.1 Why FD + tetrahedral, not the exported TD solver

The macro sets HF Time Domain, but the model was solved in **Frequency Domain** — the better choice
here: (1) tetrahedral mesh conforms to the curved swept channel (hex would staircase it); (2) the
antenna is electrically small-ish, and FD solves each frequency directly rather than ringing down a
high-Q structure over many timesteps. Everything the macro builds is solver-agnostic, so nothing is
lost.

### 5.2 The mesh-limit episode (Learning Edition, 80 k cells)

The full curved wire + 48 z-crests + λ₀/4 air box exceeded the LE cap. The **parametric model absorbed
this without a regenerate**: `z_amp = 0` collapses to the flat electrical equivalent (the z-wave is a
mechanical feature, electrically negligible), `serp_R` rescales the whole loop, `bg_space` shrinks the
air box — all live parameter edits. This is the payoff of §2: mesh experiments happen inside CST.

### 5.3 Sizing — the empirical tune

Because ε_eff ≈ 1 (§4.1), resonance came in high and was tuned by scaling `serp_R` (resonance ∝
1/size):

| `serp_R` (mm) | Resonance | Notes |
|---|---|---|
| 4.38 (bulk-εr prediction) | ~5 GHz | far too small — the ε_eff error |
| 5.58 | ~5.05 GHz, −21 dB | still small |
| 11.55 | ~2.37 GHz, −24 dB | close; a touch low |
| **~11.2 (final)** | **2.44 GHz, −24 dB** | **centred on BLE** |

### 5.4 Efficiency — the verdict

The question a deep S₁₁ *cannot* answer: does it radiate, or is it a matched heater? Far-field
(research license) settled it, at 2.44 GHz:

- **Radiation efficiency ≈ 90 % (−0.47 dB)** — of accepted power, 90 % radiates.
- **Total efficiency ≈ 81 % (−0.9 dB)** — includes mismatch; rises to ~88 % once the dip is centred.

For a heavily-meandered (factor 2.14) liquid-metal loop in lossy PDMS, ~90 % radiation efficiency is a
genuinely strong result — the meandering, EGaIn resistivity, and substrate loss did **not** kill it.

### 5.5 On-body (skin) — in progress

Body-worn is the make-or-break test. A 3-layer skin/fat/muscle phantom (IT'IS values at 2.45 GHz) is
added under the PDMS via an add-on macro. Expected: resonance drops (skin εr ≈ 38 loads the loop —
re-tune `serp_R` down) and efficiency falls. **Topology advantage:** a loop is *magnetic-dominant* and
the body is non-magnetic (μᵣ = 1, perturbs E-fields far more than H) — loops are inherently more
body-robust than patches/dipoles. Mitigations if efficiency is poor: a 1–2 mm `body_gap`
(clothing/thicker PDMS back) recovers a large fraction, since near-field coupling into skin falls off
fast with distance. SAR to follow before any human trial.

---

## 6. Errors caught, and by what

Recorded for honesty and because each is a transferable lesson.

| Error | Caught by | Lesson |
|---|---|---|
| `ε_eff = 2.68` (assumed bulk) | CST resonance at 5 GHz | thin slab ≠ bulk; ε_eff depends on slab-to-antenna size ratio |
| Boolean subtract operand order | CST "shape does not exist" | verify normal direction; reversed subtract deletes silently |
| delta-gap feed on grounded loop | 5-line Z_in calc (should have preceded the code) | check the port can present a real impedance *before* building |
| in-plane serpentine "gives strain relief" | affine strain calc | the mechanism needs a stiffness contrast liquid metal lacks |
| shape missing from `drawings.js` | 3D viewer went stale mid-render | an IR shape has **three** consumers (scene, VBA, drawings), not two |

**Meta-lesson for the report:** every CST failure past the first was a *semantics* issue invisible to
unit tests — API generations, mesh rules, namespace rules, licensing. The tight loop was: run in CST →
read the exact error → fix → re-run. The parametric model made that loop fast.

---

## 7. Code map (where each piece lives)

All in `src/physics.js` unless noted:

- `serpentineLoop(d)` — synthesis; branches on `conductorForm` (etched vs embedded) and `groundPlane`.
- `microstripWidth(z0, er, h)` — Hammerstad–Wheeler 50 Ω synthesis (verified vs Pozar §3.8, W/h = 3.081).
- `serpArc3D`, `serpZDrift`, `solveSerpZRatio` — out-of-plane strain compensation (the a/λ ≈ 0.183 solve).
- `buildVbaSerpentine`, `serpTraceBlock`, `serpChannelBlock`, `serpChannelPortBlock` — parametric CST export.
- `vbaBackgroundSpace`, `hist`/`addToHistoryLong` — boundary padding & the line-continuation-safe history wrapper.
- IR `tube` shape: `src/scene.js` (mesh spec + bounds), `src/viewer.js` (TubeGeometry), `src/drawings.js` (SVG).
- Tissue phantom: standalone add-on macro (not in the engine) — skin/fat/muscle bricks under the antenna.
- Tests: `test/physics.test.mjs`, `test/scene.test.mjs` (63 tests; VBA-vs-IR curve parity, feed
  topology, strain optimum, containment, drawings coverage, reserved-name guard).

---

## 8. Open questions / next steps

1. **On-body efficiency & SAR** — the current front. Number pending.
2. **ε_eff vs encapsulation thickness** — a small parametric study (PDMS 0.5→3 mm) would give a
   size-vs-thickness curve worth a figure in the report.
3. **z-wave EM confirmation** — restore the wave at the tuned size and confirm resonance/efficiency
   hold (proves the mechanical relief costs no RF). Needs the uncapped license for the full mesh.
4. **Affine assumption** — FEA or a printed coupon to check the channel really deforms affinely
   (the a/λ = 0.183 rule depends on it).
5. **EM-1D ε_eff model** — the engine still reports `ε_eff = εr` for embedded; either add a
   thin-slab correction or clearly mark the synthesis as a *starting point* to be tuned in CST.
