# Stretchable Liquid-Metal BLE Loop — Design Refinement & CST Validation

**Date:** 2026-07-22
**Status:** RF design validated in CST (free space); on-body (skin) analysis in progress
**Builds on:** `2026-07-19-serpentine-loop-antenna-design.md` (Type 8, the etched serpentine loop)
**Application:** 2.44 GHz BLE antenna on a flexible, stretchable kinesiology tape — elastomer cast
with an embedded channel, back-filled with EGaIn liquid metal.

> ⚠️ **Read this as a dated record, not the current design.** The substrate is now **Ecoflex-30**
> rather than PDMS — ε_r/tanδ differ slightly and the current design was re-solved with Ecoflex
> values, though every *physical argument* below (ε_eff ≈ 1, incompressibility, the strain analysis)
> transfers unchanged. Current design and fabrication process: `docs/DESIGN-EVOLUTION.md`.
> **Heed the correction banner on §5.5 — those specific numbers are invalid.**

---

## 0. TL;DR for the report

A serpentine (meander) loop was extended from a rigid etched trace into a **stretchable liquid-metal
channel embedded in PDMS**, then hardened for parametric CST export and validated by full-wave
simulation. Headline results, free space:

| Quantity | Value | Source |
|---|---|---|
| Target band | 2.400–2.4835 GHz (BLE) | requirement |
| Resonance (tuned) | **2.44 GHz, S₁₁ = −24 dB** | CST FD, tetrahedral |
| Radiation efficiency (free space) | **≈ 90 % (−0.47 dB)** | CST far-field |
| Total efficiency (free space) | **≈ 81 % (−0.9 dB)**, →~88 % when centred | CST far-field |
| Efficiency **on skin** (bare loop) | **~1–6 % total** — needs AMC backing for more (§5.6) | CST phantom |
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

### 5.5 On-body (skin) — measured

> **⚠ CORRECTION (2026-07-23) — the numbers in this section should not be quoted.**
> Re-examination of the model that produced them (`EM 2D Project.cst`) found two
> independent setup faults, either of which invalidates the efficiency figures:
>
> 1. **The antenna was mistuned by ~80 %.** That model has `serp_R = 6.3 mm` — a
>    ~4.4 GHz antenna — while efficiency was read at 2.44 GHz. An antenna that is
>    electrically small at the readout frequency shows poor radiation efficiency
>    *in free space too*, so the measurement cannot separate "loaded by tissue"
>    from "wrong size". The `body_gap` sweep confirms it: as the gap grows and
>    loading lifts, the dips converge on 4.0–4.2 GHz, heading for that free-space
>    value — not toward 2.44 GHz.
> 2. **The phantom was reflecting off its own back face.** `musc_t = 20 mm` is
>    0.9 penetration depths at 2.45 GHz (δ ≈ 22.3 mm), so ~40 % of the field
>    amplitude reached an abrupt muscle/vacuum boundary. Re-solving with
>    `musc_t = 70 mm` (≥3δ) collapses the 2–3 dips per curve into a **single clean
>    resonance** across 1.46–5.5 GHz. The "tissue's own modes" claimed below are
>    therefore most likely an artifact of the truncated phantom. (Not conclusive
>    on its own — `serp_R` also changed between those runs — so a same-`serp_R`
>    A/B is still owed.)
>
> A further methodological point: radiation efficiency was nearly **flat** across
> the whole `body_gap` sweep while total efficiency spanned ~11 dB. Since
> total = radiation × mismatch, that sweep was measuring *mismatch*, not the
> effect of standoff on radiation.
>
> Corrected defaults now live in `cst/add-tissue-phantom.vba`. Re-tuned on-body
> results and the power-per-material breakdown supersede this section; see
> `docs/superpowers/plans/2026-07-23-amc-backed-on-body-antenna.md`.

A 3-layer skin/fat/muscle phantom (IT'IS values at 2.45 GHz) was added under the PDMS via an add-on
macro (`add-tissue-phantom.vba`). Findings:

- **Resonance drops hard.** Direct contact pulled the fundamental from 2.44 GHz to ~1.35 GHz — skin
  (εr ≈ 38) raised ε_eff from ~1 toward ~3.3. On-body the antenna re-tunes *smaller* (`serp_R` down);
  the tissue's own modes also complicate the S₁₁, adding dips (a loop is multi-resonant anyway —
  perimeter = nλg — so a whole harmonic ladder appears, richer with tissue present).
- **Efficiency collapses.** At resonance on skin: **radiation efficiency ~5–8 %**, **total efficiency
  ~1–6 %** — down from 90 % / 81 % free space.
- **An air standoff barely helps.** A `body_gap` sweep 0→4 mm moved radiation efficiency only to ~8 %.
  Two reasons: (1) a loop radiates *both* ways, and the −z lobe goes straight into tissue; (2) a 4 mm
  gap is small next to a ~20 mm antenna, so tissue stays deep in the reactive near field. Decoupling by
  air alone needs a ~10–20 mm standoff — not wearable.

**Correction to an earlier claim:** the "loops are body-robust because magnetic-dominant" argument
holds for *electrically small* loops (uniform current, pure magnetic dipole). A **1λ resonant loop is
not small** — it has full standing-wave E-field structure that couples into lossy skin. So the loop's
body-robustness advantage is real but modest, not decisive.

**Verdict:** the bare loop is a poor direct-contact radiator (~1–6 % total). Whether that matters
depends entirely on required range — BLE closes short links (≤ ~2 m to a personal device) at a few
percent, so the bare loop may be shippable for that use case. Longer range needs isolation from the
body (§5.6). SAR to follow before any human trial.

### 5.6 AMC backing — the isolation option

The established fix for a body-worn antenna is an **AMC (Artificial Magnetic Conductor) / EBG** layer
between the radiator and the body — *not* a plain metal ground.

- **Why not a plain ground:** a PEC reflects 180° out of phase and *cancels* a loop sitting close above
  it (the dead grounded-loop of §3). An AMC is engineered so its **reflection phase = 0° at 2.44 GHz**,
  so the back-lobe reflects *in phase* and adds to the forward radiation, while the ground plane
  underneath shields the body. Typical published result: **40–70 %** on-body efficiency.
- **Dimensions (2.44 GHz, PDMS):** unit cell ≈ 15–20 mm (low εr → large cells); a 3×3 array is
  **~50–60 mm** — i.e. the AMC is **~2.5–3× the antenna footprint**, the main drawback. Stack ≈ 5 mm
  thick (antenna + spacer + AMC/ground) vs ~2–3 mm bare.
- **Design flow:** a unit-cell reflection-phase simulation (`amc-unit-cell.vba` + manual Floquet-port
  setup) — sweep the patch size until S₁₁ phase crosses 0° at 2.44 GHz, tile a 3×3 array, place the
  loop ~1–2 mm above, co-simulate on the phantom. ~1–2 weeks of CST work.
- **Fabrication cost (the real obstacle for liquid metal):** every conductor is a cast-and-fill cavity,
  so the AMC turns *one channel* into *one channel + nine patch cavities + a continuous ground-plane
  sheet*. A large flat EGaIn sheet is the hardest element in this process — it beads and migrates under
  stretch. Roughly triples the molding complexity; the ground sheet is the highest-risk part.

**Lighter variants (fabrication-first, worth a CST comparison):**

| Backing | Isolation | Est. on-body eff | LM fabrication |
|---|---|---|---|
| None (bare loop) | none | ~1–6 % total | 1 channel (baseline) |
| Full 3×3 AMC + solid ground | full | 40–70 % | 9 patches + solid sheet (hardest) |
| Sparse 2×2 AMC + solid ground | partial | ~30–50 % (est.) | 4 patches + sheet |
| **Mesh/grid ground** (patches over a lattice, not a sheet) | partial shield | ~15–35 % (est.) | grid *lines* cast far easier than a sheet |

The **mesh-ground** variant is the interesting fabrication compromise: thin liquid-metal grid lines
don't bead the way a solid sheet does, at the cost of some field leakage through the holes (lower
isolation → partial efficiency recovery). The efficiency estimates above are *hypotheses to test in
CST*, not measured.

**Recommendation:** for a first proof-of-concept, ship the bare loop for short-range BLE and record the
AMC as future work; commit to the AMC (or mesh variant) only when a specific range requirement demands
it. The free-space result (2.44 GHz, 90 % efficiency, strain-stable) is a complete, publishable outcome
on its own.

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

1. **On-body isolation** — bare loop is ~1–6 % total on skin (§5.5). Decide by range requirement:
   ship bare for short-range BLE, or design an AMC / mesh-ground backing (§5.6). SAR still pending.
2. **ε_eff vs encapsulation thickness** — a small parametric study (PDMS 0.5→3 mm) would give a
   size-vs-thickness curve worth a figure in the report.
3. **z-wave EM confirmation** — restore the wave at the tuned size and confirm resonance/efficiency
   hold (proves the mechanical relief costs no RF). Needs the uncapped license for the full mesh.
4. **Affine assumption** — FEA or a printed coupon to check the channel really deforms affinely
   (the a/λ = 0.183 rule depends on it).
5. **EM-1D ε_eff model** — the engine still reports `ε_eff = εr` for embedded; either add a
   thin-slab correction or clearly mark the synthesis as a *starting point* to be tuned in CST.
