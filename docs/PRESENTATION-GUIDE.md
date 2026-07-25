# Presentation Guide — EM+FM 2D Final

Companion to **[DESIGN-EVOLUTION.md](DESIGN-EVOLUTION.md)**, which holds the reasoning and the
provenance of every number. This file answers: *what goes on which slide, and which figure do I
pull it from?*

> **Working with Claude on slides:** ask it to read both files. Good prompts —
> "read docs/DESIGN-EVOLUTION.md and draft the working-principles slides", or
> "which of our results are Tier A and safe to present?", or
> "I'm doing the strain slide — give me the numbers and the caveat."

---

## The rubric drives the structure

**Final presentation = 65 % of 2D.** The weights are very different from the midterm — measurements
and poster dominate, simulation drops to 10 %:

| Criterion | Weight | Our status |
|---|---|---|
| **Antenna measurements & Analysis** | **20 %** | ⚠️ **nothing yet — biggest gap** |
| **Poster** | **20 %** | not started |
| Teamwork & presentation | 20 % | — |
| Working principles | 10 % | strong material |
| Simulation & Analysis | 10 % | very strong material |
| **Iterations** | **10 %** | unusually strong (see below) |
| Ideation & design thinking | 5 % | done in midterm deck |
| Scientific novelty | 5 % | one genuinely good result |

Two implications worth internalising:

1. **Measurements are the biggest single technical item and we have none.** Everything in this repo
   is simulation. If hardware won't be measured in time, present the fabrication process + the
   measurement plan (§4 of the evolution doc) honestly rather than padding simulation.
2. **"Iterations" (10 %) is nearly free for us.** Most teams struggle to evidence iteration. We have
   a documented trail of real errors caught by real means — see the table below. Do not hide these;
   they *are* the marks.

---

## Slide plan (~24 slides)

### Framing — compress hard (Ideation, 5 %)

**1. Title** — Kinesiology Kintenna Tape, team, EM + FM.

**2. Problem & chosen wearable.** Athletes need live tracking; existing systems are bulky; KT tape
wins. Keep the **Pugh chart** from the midterm deck — it *is* the evidence for this 5 %.

**3. Requirements & constraints.** 2.44 GHz BLE, ≤3 mm stack, must stretch, Ø0.5 mm channel floor,
substrate <1.0 mm for adhesion.
⚠️ **Fix before presenting:** the midterm deck states three *different* substrate thicknesses
(h = 2 mm, h = 0.5 mm, "<1.0 mm") on three slides, and a `tanδ = 0.0027` that is not silicone
(~0.02–0.03 is). Pick one and make it consistent.

### Design & novelty (5 %)

**4. Selected design — REWRITE from the midterm deck.** The midterm showed a *concentric patch with
a liquid-metal ground plane*. **That is not the design any more.** It is now an **ungrounded
serpentine (meander) liquid-metal loop**. New stack: Ecoflex encapsulation / EGaIn channel Ø0.5 mm
at mid-plane / Ecoflex / KT tape / skin. **No ground plane.**

**5. Novelty — our strongest claim.** Lead with the finding, not the shape:

> **An in-plane serpentine provides zero strain relief for liquid metal.**

Horseshoe interconnects work by *stiffness contrast* — stiff copper unfolds instead of stretching.
Liquid metal has no stiffness, so the channel deforms affinely: serpentine and plain circle both
change perimeter by **5.54 % at 20 % strain — identically**. The meander earns its place for
**2.14× miniaturisation**; stretchability comes from the conductor being *liquid*, not from geometry.
(Evolution doc §2c.)

### Working principles (10 %) — rubric asks for "schematics, diagrams, theoretical proofs"

**6. Loop resonance.** Perimeter = nλg → multi-resonant. This explains why S₁₁ shows two dips.

**7. Feed topology — a real proof.** `Z_in = −j(Z₀/2)·cot(βL/2)` is purely reactive ⇒ |Γ| = 1 ⇒
S₁₁ ≈ 0 dB. This is *why* the design is an ungrounded delta-gap rather than a grounded loop.
(§2b.) This is the slide that satisfies "theoretical proofs".

**8. What sets the size: ε_eff ≈ 1, not 2.68.** A loop's fields extend ~its own diameter, so a ≤3 mm
slab cannot bulk-load a ~20 mm loop. Consequence: the antenna is ~2× larger than the closed-form
predicted. (§2c.)

**9. Strain strategy — tolerance by bandwidth.** We do *not* compensate geometrically; the −10 dB
band is 11.7 % wide, about twice the worst-case shift. Use the strain table from §2f. Include the
trade: **body loading lowers Q and widens the band — the same physics that costs efficiency buys
strain tolerance.**

### Iterations (10 %) — the easy marks

**10. Design evolution.** Concentric patch → serpentine; grounded → ungrounded; bulk-ε_r sizing →
CST-tuned; PDMS → Ecoflex; z-wave derived and implemented → set aside for a flat serpentine.
⚠️ **Don't claim the z-wave is unmanufacturable** unless the fabrication process is settled — see
evolution doc §7. Say "deferred" rather than "impossible" if in doubt.

**11. "What we got wrong, and how we caught it."** This table is the slide:

| Error | Caught by | Lesson |
|---|---|---|
| ε_eff = 2.68 assumed | CST resonated at 5 GHz, not 2.44 | Thin slab ≠ bulk dielectric |
| Antenna tuned for 4.4 GHz, efficiency read at 2.44 | Dips converging on 4.2 GHz as loading lifted | Read efficiency **at** resonance |
| Muscle phantom only 20 mm = 0.9δ | Extra S₁₁ dips vanished at 70 mm | A truncated phantom fakes resonances |
| Standoff sweep "showed" radiation change | Radiation flat, total spanned 11 dB | That sweep measured **mismatch** |
| Feed model without coax shields | Resonance fell below 1.8 GHz | A feed with no return path is wrong |
| Ø0.8 junction fillet treated as cosmetic | Resonance moved +74 MHz | Feed geometry is an **RF** feature |
| AMC cell sized 15–20 mm | Two independent models → 30–70 mm | Rescale published designs for your ε_r |

### Simulation & Analysis (10 %)

**12. Method.** CST, FD tetrahedral, 3-layer IT'IS phantom (skin 2 / fat 5 / muscle **70** mm),
why tetrahedral (curved swept channel), why the phantom must be ≥3 penetration depths.

**13. S₁₁ / S<sub>dd11</sub>.** Resonance 2.423 GHz, ≈ −9 dB, 11.7 % band covering all of BLE.
**Make the point about the deeper higher-frequency dip being a "matched heater"** — 6× worse
radiation efficiency than the fundamental. Shows you read S₁₁ correctly.
Figure: `deliverables/sdd11-final.png`.

**14. Efficiency & power balance — the best figure we have.** Pie: **86 % tissue / 5.3 % substrate /
2.8 % EGaIn / 5.9 % radiated.** Proves the conductor and substrate are *not* the problem.

**15. Link budget.** 5.8 % total efficiency → **~31 dB margin at 2 m** for 0 dBm BLE. Viable
short-range.

**16. SAR.** Peak in the skin under the antenna; ≈ 0.13 W/kg at 0 dBm vs the FCC 1.6 W/kg limit.
⚠️ **State that it is a `Constant volume` estimate, not a compliance figure** (§0).

### Measurements & Analysis (20 %) — the biggest item

**17. What we fabricated.** The process, the mould CAD, photos.
Call it **replica moulding from a 3D-printed master, with a bonded cap layer** — more precise than
"soft lithography" and it shows you know the distinction. Five steps: two-cavity mould (one with the
channel as a raised positive) → cast → peel → bond flat cap to seal the channel → inject EGaIn →
mount 2 × SSMA. **No dissolvable core.** Evolution doc §7.
Two things to state if asked: whether the channel is **round or D-section** (a flat cap over a
half-round groove halves the conductor cross-section vs the simulated Ø0.5 mm circle), and that
Ecoflex needs **uncured-layer or tacky-state bonding** — plasma bonding is a PDMS trick.
**18. Measurement setup.** 2× SSMA differential on a rigid island, ferrite chokes, cable-wiggle
validation. Explain *why* differential — most teams just plug in one SMA, so this earns marks.
**19. Measured vs simulated.** Overlay. Compare **impedance**, not raw S — S<sub>dd11</sub> is
100 Ω-referenced (§4).
**20. Strain measurement.** S₁₁ at 0/5/10/20 % vs the predicted table. **Highest-value experiment
we can run** — it directly tests the affine-deformation assumption everything rests on.
**21. Discrepancy analysis.** Where sim and measurement diverge: real ε_eff, channel fill
completeness, feed parasitics.

### Close

**22. Limitations.** Full BLE to ~10 % strain only; ~6 % on-body efficiency; SAR not
compliance-grade; z-wave unfabricated; Ecoflex constants unverified.
**23. Future work.** AMC with honest sizing (plain elastomer 3×3 = 90–126 mm, too big; needs
ε_r ≈ 10); integrated BLE SoC; **z-wave strain compensation — needs a process that can form
non-planar channels** (our open-face mould cannot, hence it's deferred, not disproven).
**24. Team & contributions.**

---

## Figures: what exists, what needs making

**Committed in the repo — everyone has these** (`deliverables/`, see its README):
- `deliverables/sdd11-final.png` — differential S<sub>dd11</sub> plot
- `deliverables/serp-antenna-fab-r025.step` / `serp-channel-fab-r025.stl` — CAD, for renders
- `deliverables/param-sim-sparams.s2p` — raw 2-port Touchstone; re-plot however you like

**Needs generating (ask Claude, they're quick):**
- Power-balance pie chart (numbers in §2d of the evolution doc) — the single best slide, and it needs
  no CST access, just the four percentages
- Layer-stack cross-section for slide 4
- Strain overlay: S₁₁ at 0/5/10/15/20 % — numbers are tabulated in §2f, so the chart can be drawn
  from the table without CST
- Radiation pattern at 2.44 GHz — **this one does need CST**

⚠️ **The solved CST projects are NOT in the repo.** They live in `work/` on Bryan's machine
(~22 GB, gitignored). `work/param-sim.cst` is the final feed model and `work/flex-strain.cst` holds
the strain sweep (one Run ID per strain point). If you need a figure straight out of CST — farfield
patterns especially — ask Bryan, or rebuild with `scripts/cst_bridge.py` + the macros in `cst/`.
Also note **CST runs in quiet mode when driven by the bridge**: if the GUI looks empty after a solve,
that's why — the data is there.

---

## Do not present these

| Claim | Why not |
|---|---|
| "~5–8 % radiation / 1–6 % total on skin" (old spec §5.5) | Mistuned antenna + truncated phantom. Superseded — §2e |
| Tissue constants cited to "IT'IS / Gabriel database" | Written from memory, never looked up. Verify before attaching a citation — §6 |
| "Ø0.5 mm is our fabrication limit" | It was the synthesis engine's default, not a stated process capability — §6 |
| "The z-wave is unmanufacturable" | Depends on an unsettled process question — §7. Say "deferred" |
| "Tissue's own modes cause extra S₁₁ dips" | Most likely a truncated-phantom artifact |
| "AMC unit cell 15–20 mm, 3×3 ≈ 50–60 mm" | Wrong by ~3× for elastomer — §3 |
| "Mushroom vias miniaturise the AMC" | No effect at normal incidence — §3 |
| Concentric patch + liquid-metal ground plane | Not the current design |
| The deepest S₁₁ dip as "the resonance" | It's a higher-order mode that radiates 6× worse |
| SAR as a compliance result | Non-regulatory averaging method — §0 |
| Any resonance quoted tighter than ±0.03 GHz | Mesh/solver uncertainty ≈ 1.5 % |
