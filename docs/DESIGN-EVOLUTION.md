# Design Evolution — Kinesiology "Kintenna" Tape

**A 2.44 GHz BLE antenna on a stretchable kinesiology-tape substrate: liquid metal (EGaIn)
in a cast elastomer channel.**

This document is the project's narrative record: what we built, what we got **wrong**, how we
found out, and what the current design is. It exists so a teammate (or a teammate's Claude) can
come in cold, understand the reasoning, and contribute without re-deriving it.

> **How to use this with Claude.** Open this repo and ask normally — "read
> docs/DESIGN-EVOLUTION.md and explain the antenna design", or "which numbers are safe to put on a
> slide?". For the slide work specifically, see **[PRESENTATION-GUIDE.md](PRESENTATION-GUIDE.md)**,
> which maps findings to the grading rubric.

---

## 0. Read this first: which numbers are trustworthy

The single most useful thing in this document. Numbers in this project come from four very
different places, and **mixing them up is how a wrong figure ends up on a slide.**

| Tier | Meaning | Safe to present? |
|---|---|---|
| **A — CST-measured (current)** | Solved in CST on the current geometry | **Yes**, with the caveat noted |
| **B — CST-measured (superseded)** | Solved, but on geometry/setup later found faulty | **No** — see §3 |
| **C — Analytical / closed-form** | Hand or `physics.js` calculation, not full-wave | Yes, *labelled as analytical* |
| **D — Assumed / from literature** | Material constants, published comparisons | Yes, *cited as assumption* |

**Tier A — the current headline results** (all on-body, Ecoflex, with the real SSMA feed modelled):

| Quantity | Value | Where from |
|---|---|---|
| Differential resonance S<sub>dd11</sub> | **2.423 GHz** | `work/param-sim.cst`, FD tetrahedral |
| Differential match across BLE | **≈ −9 dB**, flat | same |
| Radiation efficiency (on-body) | **≈ 6 %** | same |
| Total efficiency (on-body) | ≈ 5.8 % | earlier tuned run, ideal feed |
| Power absorbed by tissue | **86 %** of accepted | power-balance readout |
| −10 dB bandwidth | **11.7 %** | covers all of BLE |
| Peak 1 g SAR @ 0 dBm | ≈ 0.13 W/kg (limit 1.6) | hex TD + SAR post-processing |
| Strain: full BLE coverage | **to ≈ 10 %** strain | CST strain sweep |

**Every one of these carries ~1.5 % mesh/solver uncertainty.** Do not quote resonance to better
than ±0.03 GHz. Two independent solvers (FD tetrahedral and hex TD) agreed on *efficiency* within
a few tenths of a dB but disagreed on *resonance* by 1.4–6 % depending on mesh density — the
tetrahedral figure is the one to quote, because a hex mesh staircases the curved channel.

**Known-weak assumptions (Tier D) — state these out loud rather than hide them:**

- **Ecoflex-30 ε<sub>r</sub> = 2.6, tanδ = 0.03** — an estimate, *not* read off a datasheet. Low
  risk because ε_eff ≈ 1 here (§3.1) makes resonance insensitive to it, but it is unverified.
- **SAR used `Constant volume` averaging, which is _not_ a regulatory method.** Every proper method
  (IEC/IEEE 62704-1, IEEE C95.3, CST C95.3) fails on a finite phantom. Present SAR as an
  engineering estimate, never as a compliance claim.
- **The affine-deformation assumption** underpinning all strain results — that the liquid-metal
  channel deforms with the bulk elastomer — is unvalidated by experiment. This is precisely what
  the physical strain test should check.
- **No physical measurements exist yet.** Everything above is simulation.

---

## 1. The arc, in one page

```
 (a) EM-1D web synthesis tool ── 7 closed-form antenna types, CST VBA export
                │
 (b) + serpentine meander loop  ── 8th type. Discovery: a grounded loop CANNOT match
                │
 (c) pivot: stretchable liquid metal ── EGaIn in PDMS. ε_eff ≈ 1, not 2.68 → antenna 2× larger
                │
 (d) on-body validation ── skin/fat/muscle phantom. 86 % of power absorbed by the body
                │
 (e) audit: earlier on-body data was INVALID (two independent setup faults) → re-measured
                │
 (f) simplification ── drop the z-wave; PDMS → Ecoflex-30; flat serpentine only
                │
 (g) real feed design ── crest feed → stubs → wells → 2× SSMA, differential
                │
 (h) CURRENT: serp_R = 8.95 mm, fillet 0.25, Sdd11 2.423 GHz / −9 dB / ~6 % efficiency
```

Stages (a)–(d) are recorded in the specs under `docs/superpowers/`. Stages (e)–(h) happened
2026-07-23 → 07-25 and are recorded here and in the AMC plan.

---

## 2. Stage-by-stage

### (a) The synthesis tool — `docs/superpowers/specs/2026-06-29-*`

A browser tool that computes antenna geometry from requirements and exports a CST VBA macro.
Still in the repo and still passing its 64 tests, but **no longer the active work** — it was the
means, not the end.

### (b) The serpentine loop, and the grounded-loop proof — `2026-07-19-*`

A meander loop earns **1.75× miniaturisation** over a plain 1λ loop — compared at *equal path
length*, i.e. same resonant frequency:

| | Path | Footprint Ø |
|---|---|---|
| Serpentine (as built) | 120.8 mm | **22.2 mm** |
| Plain circular loop | 120.8 mm | 38.9 mm |

1.75× on diameter, **3.07× on area**. On 50 mm kinesiology tape that is 13.9 mm of margin each side
versus 5.5 mm — the plain loop technically fits but leaves no room for the feed. Conductor length is
identical by construction, so the meander costs **no** extra ohmic loss.

> ⚠️ **Earlier drafts said 2.14×. That was wrong for this design** — it came from the z-wave version,
> whose quoted path length was the *3D* arc including the out-of-plane undulation (~+28 % path). The
> flat serpentine gives 1.75×. Use 1.75×.

**Honest gap: no plain-loop control was ever simulated.** The size advantage above is geometry and is
solid. But the *cost* — meandering should reduce radiation efficiency, because adjacent
anti-parallel segments (~4.7 mm apart ≈ 0.04 λ) partially cancel in the far field — has never been
measured against a circular baseline. So "the meander is worth it" is a reasoned argument, not a
demonstrated trade. If a plain-loop comparison run is ever affordable, that is the experiment.

The important find was structural, not incremental. An early grounded version produced **flat
S₁₁ ≈ 0 dB across the whole band** — total reflection. That is not a tuning failure; it is
provable. A closed loop tapped at one point is two λ/2 arms in parallel:

```
Z_in = −j (Z₀/2) · cot(β L/2)      ← purely reactive at every frequency ⇒ |Γ| = 1
```

A lossless reactance reflects everything. The real part could only come from radiation, which a
ground plane close behind the loop suppresses. This is why the classic microstrip ring resonator
is fed through a **coupling gap**, never a direct tap.

**Consequence that shaped everything after:** the design is an **ungrounded, balanced,
delta-gap-fed loop**. No ground plane, no counterpoise. Good for body-wear (nothing has to serve
as a stretching ground plane) — and the reason the feed is hard (§2g).

### (c) The stretchable pivot, and the ε_eff error — `2026-07-22-*`

Not etched copper: **EGaIn liquid metal injected into a cast elastomer channel**. Three
consequences:

**ε_eff ≈ 1, not 2.68 — the most expensive mistake in the project.** The synthesis assumed an
embedded conductor sees dielectric all round, so ε_eff = ε_r = 2.68. That predicted
`serp_R = 4.38 mm`. **CST resonated it near 5 GHz, not 2.44.** Why:

> ε_eff = ε_r holds only in *infinite bulk* dielectric. A ≤3 mm slab around a 10–20 mm loop does
> not bulk-load it — a loop's fields extend roughly its own diameter, so most of the field lives
> in **air**. ε_eff collapses toward **1**.

The antenna is therefore **~2× larger** than the closed-form predicted. **Lesson: size this class
of antenna empirically in CST; do not trust a closed-form ε_eff.**

**EGaIn loss is not the problem.** σ ≈ 3.4 × 10⁶ S/m, ~17× worse than copper, but an injected
Ø0.5 mm channel has large surface area and skin-effect loss scales with perimeter → conductor
efficiency ≈ 98 %. Confirmed later by the power balance (§2d): EGaIn accounts for 2.8 % of loss.
**Do not over-engineer the metal.**

**The in-plane serpentine provides ZERO strain relief — our best novelty result.** The intuition
came from horseshoe interconnects in stretchable electronics. But that mechanism **requires a
stiffness contrast**: stiff copper meanders *unfold* instead of stretching. **Liquid metal has no
stiffness.** The channel is a void that deforms *affinely* with the elastomer:

| | serpentine | plain circle |
|---|---|---|
| Δ(perimeter) @ 20 % strain | **5.54 %** | 5.54 % |

**Identical.** The meander earns its place for miniaturisation, not strain tolerance. Stretchability
comes from the conductor being *liquid* (it cannot fatigue or crack), not from the geometry.

### (d) On-body: where the power actually goes

A 3-layer skin/fat/muscle phantom (IT'IS constants at 2.45 GHz) under the antenna. The decisive
measurement was not efficiency but the **power balance** at 2.44 GHz:

| Sink | Share of accepted power |
|---|---|
| Muscle | 45.8 % |
| Skin | 33.1 % |
| Fat | 7.1 % |
| **Tissue subtotal** | **86.1 %** |
| Ecoflex/PDMS substrate | 5.3 % |
| EGaIn conductor | 2.8 % |
| **Radiated** | **5.9 %** |

This converts "efficiency is low" into "**86 % of the power is going into the arm, and nothing
else is lossy**". That is the quantitative justification for an AMC (shielding layer) — and
equally, proof that the conductor and substrate are fine.

### (e) The audit — why the first on-body dataset was thrown away

**Read this before quoting any pre-2026-07-23 on-body number.** The original sweep produced
"~5–8 % radiation, ~1–6 % total efficiency". Both figures were invalid, for two *independent*
reasons:

1. **The antenna was mistuned by ~80 %.** That model had `serp_R = 6.3 mm` — a **~4.4 GHz**
   antenna — while efficiency was read at 2.44 GHz. An antenna that is electrically small at the
   readout frequency shows poor radiation efficiency **in free space too**, so the measurement
   could not separate "loaded by tissue" from "wrong size". The gap sweep confirms it: as the gap
   grew and loading lifted, the dips converged on 4.0–4.2 GHz — not on 2.44.

2. **The phantom was reflecting off its own back face.** `musc_t = 20 mm` is only **0.9 penetration
   depths** at 2.45 GHz (δ ≈ 22.3 mm), so ~40 % of the field amplitude reached an abrupt
   muscle/vacuum boundary. Re-solving with `musc_t = 70 mm` (≥3δ) collapsed the 2–3 dips per curve
   into **one clean resonance**. The "tissue's own modes" in the old spec were most likely a
   truncated-phantom artifact.

A third, methodological error: radiation efficiency was **flat** across the whole standoff sweep
while total efficiency spanned ~11 dB. Since total = radiation × mismatch, that sweep was
measuring **mismatch**, not the effect of standoff on radiation. "An air gap barely helps" was the
right conclusion drawn from partly the wrong evidence.

Corrected defaults now live in `cst/add-tissue-phantom.vba`, which also carries a warning that the
on-body re-tune is **not optional**.

### (f) Simplifications that stuck

- **The z-wave is dropped, and the process confirms it can't be built.** An out-of-plane undulation
  was derived to give strain-invariant resonance (optimum a/λ_z ≈ 0.183, Δf₀ < 0.2 % to 20 % strain —
  a nice analytical result), and was fully implemented in the engine and the CST export. It is out
  because **replica moulding against an open-face mould can only produce planar channels** (§7): a
  buried undulation cannot be demoulded. All simulations ran `z_amp = 0`, so they match what gets
  built.

  Two footnotes worth keeping straight, because they are easy to garble:
  - The *original* `z_amp = 0` runs were flattened to fit a **mesh-cell licence cap**, as an
    electrically-equivalent stand-in. The manufacturability reason came later and independently —
    don't present the licence cap as the design reason.
  - Even geometrically it was marginal: CST flagged the swept tube as near self-intersecting at 48
    z-crests on a Ø0.5 mm channel (curvature radius ≈ 0.275 mm vs 0.25 mm tube radius). Fixes if it
    is ever revived under a different process: fewer `z_cyc`, or a thinner channel.
- **Strain tolerance comes from bandwidth instead.** Measured in CST:

  | Strain | Resonance | Shift | BLE covered |
  |---|---|---|---|
  | 0 % | 2.464 GHz | — | **100 %** |
  | 5 % | 2.406 | −2.4 % | **100 %** |
  | 10 % | 2.352 | −4.6 % | **100 %** |
  | 15 % | 2.298 | −6.7 % | 36 % |
  | 20 % | 2.248 | −8.8 % | **0 %** |

  Full BLE coverage holds to **~10 % strain**, then falls off sharply. Note the full-wave shift at
  20 % (−8.8 %) is **~40 % larger than the analytical perimeter model predicts** (−6.1 %) — the
  channel cross-section thins under strain and the loop goes elliptical, effects perimeter alone
  can't capture. *A simulation correcting an analytical prediction.*

  There is also a pleasing trade to state: the body loading that costs efficiency also **lowers Q
  and widens the band**, which is what buys the strain tolerance.
- **PDMS → Ecoflex-30.** RF is near-identical (ε_r 2.5–2.8 either way, and ε_eff ≈ 1 washes out the
  difference). The reason is mechanical: Ecoflex is ~20–30× softer, which fixes the "above 1 mm the
  silicone goes rigid and the tape peels" problem. Dimensions carry over unchanged.

### (g) The feed — the part that is genuinely hard

A **balanced** antenna fed by **unbalanced** coax. Get this wrong and the cable becomes part of
the antenna. Evolution:

1. **Node feed** (gap at a meander zero-crossing) — the original.
2. **Crest feed** — gap moved to an outward crest so the terminals sit at the antenna's outer
   edge, where a connector can actually be reached.
3. **Wider gap?** Rejected. Widening the *arc* saturates: the straight-line gap peaks at ~2.5 mm
   then *shrinks* as the terminals ride down the bump. Geometry, not tuning.
4. **Fan-out stubs** — the loop keeps its ~1 mm resonant gap; two straight 0.5 mm stubs carry the
   terminals out to pads **8 mm apart** (5 mm SSMA footprint + 3 mm clearance).
5. **EGaIn wells** — Ø1.8 mm columns the connector centre pins dip into, so the pin is *wetted*
   rather than tip-touching. **Hard constraint: EGaIn contacts the centre pin ONLY.** If it bridges
   to the shell or a ground leg, the port is shorted and you measure a dead short, not an antenna.
6. **2× SSMA, differential.** Two 50 Ω ports; the meaningful quantity is
   **S<sub>dd11</sub> = (S₁₁ − S₁₂ − S₂₁ + S₂₂)/2**.

**Two findings here that are worth slides:**

- **The feed detunes the antenna, and the model must include the coax shields.** A first model
  without shields put resonance below 1.8 GHz — an *artifact*: with no return path within 1.5 mm of
  each pin, the model exaggerated feed inductance. Adding proper coax shields brought resonance
  back to 2.395 GHz. **The lesson: you cannot design the loop in isolation from its feed, and a
  feed model without a return path is wrong.**
- **The junction fillet is an RF feature, not cosmetic.** Rounding the sharp stub/loop corner with
  a Ø0.8 mm blend shifted resonance **+74 MHz**. Reduced to Ø0.5 (flush with the trace) it moves
  only ~4 MHz. Any feed-geometry change must be *in the simulation*, not applied to the CAD
  afterwards. (Rounding also matters for fabrication: a sharp inner corner traps air and starves
  the EGaIn fill.)

### (h) Current design

| Parameter | Value |
|---|---|
| `serp_R` | **8.95 mm** |
| `amp_ratio` / `serp_ratio` / `serp_n` | 0.2 / 0.05 / 12 |
| Channel radius `chan_r` | 0.25 mm (Ø0.5) |
| Junction fillet `fillet_r` | 0.25 mm (flush) |
| Substrate | Ecoflex-30, ≈1.95 mm |
| Feed | crest → 2 stubs → wells at (14, ±4), 2× SSMA differential |
| `z_amp` | 0 (flat) |

---

## 3. The AMC question (open)

On-body efficiency is ~6 % because 86 % of the power is absorbed. The established fix is an **AMC**
(Artificial Magnetic Conductor) between antenna and body — reflection phase 0° at 2.44 GHz, so the
back lobe adds in phase while the ground underneath shields the body. Published on-body results:
40–70 %.

**But we corrected a sizing error that makes plain PDMS/Ecoflex unviable.** The earlier spec
estimated a 15–20 mm unit cell (3×3 ≈ 50–60 mm). Two independent models — half-wave patch, and the
Sievenpiper LC sheet — agree that is wrong by ~3× for a low-ε_r elastomer:

| Configuration | Cell | 3×3 array |
|---|---|---|
| `amc-unit-cell.vba` original defaults | resonates at **7.3 GHz** | — |
| Plain PDMS, h = 1.5 mm | 52–70 mm | 156–210 mm |
| Plain PDMS, h = 3.0 mm | 30–42 mm | 90–126 mm |
| ε_r = 10 filler, h = 3 mm | 15.8 mm | 47 mm |

Against a ~22 mm antenna, plain elastomer is not wearable. The 15–20 mm figure corresponds to
**ε_r ≈ 10** — apparently carried over from an FR-4/ceramic design without rescaling.

**Also corrected: mushroom vias do not miniaturise the cell here.** Under *normal* incidence — the
reflection-phase setup — the incident E-field is purely transverse, so a z-directed via carries no
current and cannot change reflection phase (Luukkonen et al., IEEE TAP 56(6), 2008). Vias help for
*oblique* incidence and surface-wave bandgap, not size.

**Bottom line for the report: the bare loop is viable for short-range BLE without an AMC.** At
5.8 % total efficiency, a 0 dBm BLE link to a device 2 m away closes with **~31 dB of margin**. The
AMC is where the *headroom* is, not where the *viability* is. Full plan:
`docs/superpowers/plans/2026-07-23-amc-backed-on-body-antenna.md`.

---

## 4. How to measure it (nobody has yet)

The antenna is **balanced**, so a single coax feed is wrong — its shield would carry common-mode
current and radiate.

- **Two-port differential.** Port 1 → terminal 1, port 2 → terminal 2, shields bonded at the
  antenna, ferrite chokes on both cables, routed symmetrically.
- **Calibrate to the connector plane** (2-port SOLT/ecal). The cable length is then removed
  mathematically — **do not model the cable in CST**; the simulation already stops at the same
  plane.
- **Compute S<sub>dd11</sub>.** Many VNAs do this natively ("balanced ports" / "mixed-mode"); if not,
  export `.s2p` and combine — `scikit-rf`'s `Network.se2gmm(p=1)`, or the formula directly.
- **Watch the reference impedance.** S<sub>dd11</sub> from two 50 Ω ports is referenced to
  **100 Ω**. Comparing it against a 50 Ω simulated S₁₁ will make a good antenna look broken. Safest
  is to compare **impedances** (`Zdiff = 100(1+Sdd11)/(1−Sdd11)`) against CST's `Z1,1`.
- **Validity checks:** sweep, move the cables, sweep again — any shift means common-mode
  contamination. Watch S<sub>cc11</sub> (simulated ≈ −1.2 dB, mostly rejected). And if either port
  reads a flat ~0 dB short, the EGaIn has bridged pin-to-ground.

**Target to reproduce: S<sub>dd11</sub> ≈ −9 dB at ≈ 2.42 GHz.** Match → model validated. Large gap
→ suspect fabrication (EGaIn fill, real Ecoflex ε_r, pin contact), then the feed.

Worth fabricating **three loop sizes** (e.g. 8.6 / 8.95 / 9.5 mm) rather than one: ε_eff is the
least trustworthy quantity in the design (§2c), and three (radius → measured resonance) points let
you back out the real ε_eff instead of getting one pass/fail.

---

## 5. Repo map

| Path | What it is |
|---|---|
| `docs/DESIGN-EVOLUTION.md` | **This file** — the narrative |
| `docs/PRESENTATION-GUIDE.md` | Slide plan mapped to the grading rubric |
| `deliverables/` | **Final CAD, the S<sub>dd11</sub> plot, and raw S-parameters** — committed, so everyone has them |
| `docs/superpowers/specs/2026-07-22-*` | Liquid-metal spec. **§5.5 has a correction banner — heed it** |
| `docs/superpowers/plans/2026-07-23-*` | AMC plan + the corrected on-body baseline |
| `cst/add-tissue-phantom.vba` | Phantom add-on (corrected defaults + densities) |
| `cst/amc-unit-cell.vba` | AMC unit cell (defaults corrected to ~2.44 GHz) |
| `cst/generate-macro.mjs` | Headless macro generator from `physics.js` |
| `scripts/cst_bridge.py` | Drives CST from Python: build / solve / read S-params + efficiency + power |
| `src/physics.js` | The closed-form engine (still 64/64 tests green) |
| `work/` | **Not in the repo** — CST projects + solver scratch, ~22 GB, gitignored. Rebuildable from `cst/` + `scripts/cst_bridge.py` |

### Environment gotchas

- **`node`/`npm` may not be on PATH.** Use another app's bundled Node — see `CLAUDE.md`.
- **CST 2024** is the working install (a `2026` folder exists but is a stub). Python API needs
  CPython **3.10** to match the shipped `.pyd`. Paths in `scripts/cst_bridge.py`.
- **CST modal dialogs silently hang automation.** If a solve seems stuck with no log activity, look
  for a dialog. `cst_bridge.py --quiet` auto-answers them.
- **SAR needs a hex mesh AND a density (`.Rho`) on every tissue.** Both were missing originally and
  CST reports only a bare "SAR calculation failed". The substrate must have **ρ = 0**, or CST counts
  it as biological tissue and reports the peak inside your own slab.

---

## 6. Provenance warnings — things widely assumed but never actually sourced

Recovered by cross-checking this project against the earlier design conversation (2026-07, before
the work moved to Claude Code). These are *not* wrong — they are **unverified**, and several are
quoted in the specs as though they were sourced. Fix the citation or verify the value before any of
them lands on a slide with a reference attached.

| Value used | Real status |
|---|---|
| Tissue constants — skin ε_r 38 / σ 1.46, fat 5.28 / 0.102, muscle 52.7 / 1.74 | Described in the specs and `add-tissue-phantom.vba` as "IT'IS / Gabriel database". **They were written from memory; no database lookup was performed.** The values are plausible and standard, but the citation is currently unsupported — look them up before citing. Also single-band and non-dispersive, which is fine for narrowband BLE |
| PDMS ε_r 2.68 / tanδ 0.02, Ecoflex ε_r 2.6 / tanδ 0.03 | Both estimates, **no datasheet consulted for either**. Low impact (ε_eff ≈ 1 washes it out) but unverified |
| EGaIn σ = 3.4 × 10⁶ S/m, ρ = 6250 kg/m³ | Estimates from memory. Underpin the "conductor efficiency ≈ 98 %" claim |
| **Channel Ø0.5 mm** | ⚠️ This was the **synthesis engine's default**, never a stated fabrication capability. It is treated throughout the docs as a hard process floor — **that framing is unverified.** All sizing, loss and mesh figures assume it. Check what the real process can actually cast |
| Elastomer modulus | Never used in any calculation. The PDMS-vs-Ecoflex stiffness argument (§2f) is qualitative only |
| Hammerstad–Wheeler microstrip synthesis | **Genuinely cross-checked** — code gives W/h = 3.0812 against a reference 3.081 (ε_r 2.2, h 1.575 mm, 50 Ω). The numerical agreement is real; the Pozar §3.8 citation is from memory |
| a/λ_z ≈ 0.183 z-wave optimum | Derived here from an affine kinematic model (ν = 0.5), scale-invariant across m_z = 24…96. **Not from literature** — original, and correspondingly unvalidated |

A useful consistency check that **passes**, worth knowing when the two datasets look contradictory:
the earlier work tuned `serp_R ≈ 11.2 mm` → 2.44 GHz in **free space** with an ideal port; this work
tuned `serp_R = 8.95 mm` → 2.42 GHz **on-body with the real connector feed**. Smaller is the correct
direction (tissue loading and added feed length both pull resonance down, so the loop must shrink to
compensate), and ~25 % is a plausible magnitude. The match also went from −24 dB to −9 dB, which is
expected: different reference impedance (100 Ω differential vs 50 Ω single-ended) and a real lossy
feed instead of an ideal source. **Two independent runs agreeing in direction and magnitude is
evidence the model is behaving.**

---

## 7. Fabrication process — RESOLVED: replica moulding with a bonded cap

**Settled 2026-07-25 from the CAD (`Antenna Molds v3`) and the team's confirmation. There is no
dissolvable core — an earlier design conversation described one, and that is out of date.**

The process:

1. **Two-cavity mould.** One cavity carries the channel network as a **raised positive** on its
   floor; the second cavity is flat.
2. **Cast** elastomer over the positive → peel → a slab with an **open groove** in its face.
3. **Cast the flat layer**, then **bond** it over the grooved face → the groove becomes a **sealed
   channel**.
4. **Inject EGaIn** into the sealed channel.
5. **Mount 2 × SSMA-KE**, pins down into the connector wells.

The proper name is **replica moulding** — the casting family usually called *soft lithography* —
with a **cap-layer bond** to close the channels. Because the master is 3D-printed rather than
photolithographic, "replica moulding from a printed master" is the precise description. Say that on
the fabrication slide rather than "soft lithography" alone; it is more accurate and shows you know
the distinction.

**What this settles:** an open-face mould can only produce **planar** channels — you cannot demould a
buried out-of-plane undulation from a rigid open cavity. So the **z-wave genuinely is not
manufacturable by this process**, and §2f's conclusion stands on process grounds, not just team
preference.

**What it means for the STL deliverable:** `serp-channel-*.stl` is the **channel-volume solid**, i.e.
the geometry to print as the mould's raised **positive master**. It is *not* a sacrificial core to be
dissolved. (Both roles need the same solid, which is why the file is still correct — only the label
was wrong.)

### Two open fabrication questions the CAD raises

1. **Is the channel cross-section round or D-shaped?** A raised half-round master + a *flat* cap
   gives a **D-section** groove, which has roughly **half** the cross-sectional area of the Ø0.5 mm
   **full circle** every simulation assumed. A full round channel needs matching half-round relief
   in **both** mould halves, aligned. This changes conductor cross-section (hence resistance and
   inductance) — modest at 2.44 GHz, but it is a real sim-vs-build difference. Decide which you're
   making, and say so.
2. **Where does the channel sit in the stack?** The channel forms at the **bond interface** between
   the two cast layers. The simulation puts it at the **mid-plane** of a ≈1.95 mm slab. That holds
   only if the two layers are of equal thickness — a thin cap pushes the conductor off-centre and
   closer to skin, which changes body loading. Match the layer thicknesses, or re-solve for the
   real offset.

**Bonding note for Ecoflex specifically:** the plasma-bonding trick that seals PDMS-to-PDMS does not
work well on Ecoflex. The usual approaches are a thin **uncured silicone layer as adhesive**, or
bonding while the cap is **partially cured** and still tacky. Worth planning, because an incomplete
bond leaks EGaIn under stretch — and that is the failure mode this design can least afford.

---

## 8. Open questions

**Blocking the build:**

1. **No physical measurement yet** — the single biggest gap, and 20 % of the final grade.
2. **Channel cross-section: round or D-section?** (§7) — a flat cap over a half-round groove halves
   the conductor cross-section vs the simulated Ø0.5 mm circle.
3. **Are the two cast layers equal thickness?** (§7) — the channel forms at the bond interface; the
   simulation assumes it sits at the slab mid-plane.
4. **How will the Ecoflex cap be bonded?** (§7) — plasma bonding is a PDMS trick; an incomplete bond
   leaks EGaIn under stretch.
5. **Is Ø0.5 mm actually castable?** — it's an engine default we've been treating as a process
   constraint (§6).

**Affecting what we can claim:**

6. **Material constants unverified** — Ecoflex ε_r/tanδ, EGaIn σ, and the tissue values all need a
   real source (§6).
7. **Affine-deformation assumption untested** — needs FEA or a printed coupon. All strain results
   rest on it.
8. **SAR is not compliance-grade** — needs a larger phantom for the IEEE averaging methods to run.

**Longer-term:**

9. **AMC route undecided** — ceramic-loaded (ε_r ≈ 10) vs stacked patches vs ship bare. Note the
   decision trigger is a **required-range spec that has never been stated**: the bare loop closes a
   2 m link with ~31 dB margin, so without a range requirement there is no case for the AMC.
10. **`physics.js` still reports ε_eff = ε_r for embedded conductors** — the §2c error is documented
    but not fixed in code; the engine's embedded output should be treated as a starting point only.
11. **No team/scope record** — the earlier design conversation contains no EM/FM split, roles, or
    deadlines. The midterm deck's author list is currently the only source.
