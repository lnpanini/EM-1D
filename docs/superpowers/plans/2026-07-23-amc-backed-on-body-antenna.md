# AMC-Backed On-Body Antenna — Plan

**Date:** 2026-07-23
**Status:** planning — Phase 0 sizing gate complete, blocks on a route decision
**Builds on:** `2026-07-22-stretchable-liquid-metal-ble-antenna.md` §5.6, §8.1
**Goal:** recover on-body efficiency from ~1–6 % (bare loop, direct skin contact) toward
40–70 % by inserting an AMC between the loop and the body.

---

## 0. The finding that reorders everything

§5.6 estimates a **15–20 mm unit cell** and a **~50–60 mm** 3×3 array. That is wrong for PDMS
by roughly 3×. Two independent models agree:

- **Half-wave patch:** `patch = λ₀ / (2√ε_eff)`. At 2.44 GHz on PDMS (ε_eff between
  (εr+1)/2 = 1.84 and εr = 2.68) → **37.5–45.3 mm**.
- **Sievenpiper LC sheet:** grounded-slab inductance `L = μ₀h` against the patch-grid
  capacitance `C = ε₀ε_eff(2p/π)·ln(1/sin(πg/2p))`, resonating at `1/(2π√(LC))`.

| Configuration | Result |
|---|---|
| `amc-unit-cell.vba` defaults (cell 18, patch 15, h 1.5) | **7.30 GHz** — 3× high |
| PDMS, h = 1.5 mm, gap 0.5–2 mm | cell **51.9–70.1 mm** → 3×3 = **156–210 mm** |
| PDMS, h = 3.0 mm, gap 0.5–2 mm | cell **29.9–42.0 mm** → 3×3 = **90–126 mm** |

A 3×3 array of 90–210 mm is not a wearable tape. The 15–20 mm figure corresponds to
**εr ≈ 10**, so it appears carried over from an FR-4/ceramic design without rescaling to
PDMS. **The plain-PDMS AMC is not viable at 2.44 GHz** — Phase 2 is therefore not optional
polish, it is the load-bearing phase.

Two levers, both from the same formula:

- **Thickness.** `L = μ₀h`, so cell size scales ~`1/√h`. Going 1.5 → 3 mm nearly halves it.
  Costs stack height (§5.6 already budgets ~5 mm with an AMC vs 2–3 mm bare).
- **Permittivity.** `C ∝ ε_eff`, so cell scales ~`1/√εr`.

| AMC layer εr (h = 3 mm, gap 1 mm) | Cell | 3×3 array |
|---|---|---|
| 2.68 (plain PDMS) | 35.0 mm | 105 mm |
| 6.0 | 21.8 mm | 65 mm |
| 10.0 | 15.8 mm | 47 mm |
| 20.0 | 10.2 mm | 31 mm |

For reference the antenna footprint is ~23 mm. Only εr ≳ 10 puts the array in the same size
class as the radiator.

---

## 1. Phases

### Phase 0 — Sizing gate ✅ (done, above)

Deliverables: the corrected tables above, and a fix to `cst/amc-unit-cell.vba` whose defaults
currently target 7.3 GHz. **Outcome: plain PDMS is ruled out; a miniaturisation route must be
chosen before CST time is spent.**

### Phase 1 — Route decision ⛔ **blocking**

Not a simulation task — a fabrication and materials call (see §2). Everything downstream
depends on it, and each route implies a different unit cell to model.

### Phase 2 — Unit-cell reflection phase in CST (~1 day once routed)

1. Run the corrected `amc-unit-cell.vba` in a **new empty project**.
2. Boundaries: `Xmin/Xmax/Ymin/Ymax = unit cell`, `Zmin = electric (Et=0)` (this *is* the
   ground), `Zmax = open (add space)`. Floquet port at Zmax, θ=φ=0, 2 modes (TE+TM).
   Frequency Domain solver — it switches to the periodic solver automatically.
3. Read `1D Results > S-Parameters > S1,1` → **Phase**. The 0° crossing is the AMC frequency;
   the ±90° span is the usable in-phase band.
4. Sweep `patch` to land the crossing on 2.44 GHz. Keep a 1–3 mm inter-patch gap; grow `cell`
   with `patch`.

**Validation gate:** the CST crossing should land within ~15 % of the Phase 0 prediction. A
wider miss means the model is wrong and the sweep range is untrustworthy — re-derive before
continuing. Record the ±90° bandwidth; a narrow band is fragile to on-body detuning.

### Phase 3 — Array + loop co-simulation, free space (~2 days)

Tile the tuned cell 3×3 (drop to 2×2 if size forces it), place the tuned loop 1–2 mm above,
solve in free space **first**. Purpose is to isolate AMC-induced detuning from body loading:
the AMC will pull the loop's resonance, and `serp_R` must be re-tuned before the phantom is
added. Confirm the array hasn't destroyed the free-space 90 % radiation efficiency.

### Phase 4 — On-body (~2–3 days)

Add the skin/fat/muscle phantom via `add-tissue-phantom.vba` (it stacks under the existing
model without rebuilding the antenna). Re-tune, then measure radiation and total efficiency
against the bare-loop baseline of ~5–8 % / ~1–6 %. Sweep the antenna-to-AMC spacing (1–3 mm)
and `body_gap`. **Success = total efficiency ≥ 30 %.** Then SAR, mandatory before any human
trial and still outstanding per §8.1.

### Phase 5 — Fabrication feasibility (parallel with 3–4)

The ground sheet is the highest-risk element: a large flat EGaIn plane beads and migrates under
stretch (§5.6). Evaluate the mesh/grid-ground variant — grid *lines* cast far more reliably than
a sheet — and quantify the isolation lost through the holes, which is currently a hypothesis
rather than a measurement.

---

## 2. Route options for Phase 1

> **Correction (2026-07-23):** an earlier draft of this plan recommended mushroom vias as the
> miniaturisation route. That is wrong for this design pass. Under **normal incidence** (θ=φ=0,
> which is what the reflection-phase setup uses) the incident E-field is purely transverse, so a
> z-directed via carries no current and has **no effect on reflection phase** — a mushroom cell
> and a plain patch cell are identical at θ=0 (Luukkonen et al., IEEE TAP 56(6), 2008). Vias
> matter for *oblique* incidence (TM has an E_z component) and for surface-wave bandgap. Both are
> worth having on-body, but neither shrinks the cell.

Cell size is set by `f = 1/(2π√(LC))`, so only three levers exist: raise **C** (permittivity, or
gap/overlap capacitance), raise **L** (thicker slab, or a longer current path inside the patch),
or accept a bigger cell.

| Route | Lever | Cell (3×3) | Pros | Risks |
|---|---|---|---|---|
| **A. Ceramic-loaded PDMS** (BaTiO₃/Al₂O₃ filler, εr 10–20) | C ∝ εr | 15.8 mm (47 mm) @ εr 10 | Patch stays a plain square — the easiest liquid-metal cast | Filler **stiffens the elastomer**, fighting the stretchability that motivates the design; tanδ rises, eating the efficiency being bought; needs characterisation |
| **B. Interdigital / spiral / meandered patch** | C (fingers) and L (path length) | ~λ₀/10–λ₀/20 | Pure geometry, no new materials | Fine features are the hardest thing to cast; directly opposes the ⌀0.5 mm channel floor already established |
| **C. Stacked offset patch layers** (broadside-coupled) | C (parallel-plate between layers) | strong reduction | Large C without fine in-plane features; a second cast layer is a process the project already has | Adds a layer to the stack and to mould complexity; alignment between layers matters |
| **D. Abandon full AMC** → mesh ground or ship bare | — | n/a | Zero new process risk; §5.6 already recommends bare for short-range BLE | Leaves on-body efficiency at a few percent |

**Recommendation: A (ceramic-loaded PDMS), with C as the geometric fallback.** Route A is the
only one that shrinks the cell without fine features, and the stiffness cost can be confined by
loading *only the AMC layer* — the antenna layer stays soft, and the AMC sits between the tape
and the body where stretch demand is lowest. Route B fights the known ⌀0.5 mm feature floor.
Route C is attractive if a second cast layer proves cheap, and is worth costing during Phase 5.

Regardless of route, **vias remain worth testing later** for oblique-incidence stability and
surface-wave suppression — just not as a size lever, and not before a cell resonates at 2.44 GHz.

---

## 3. Automation

`scripts/cst_bridge.py` attaches to the running CST session, pushes a macro, solves, and reads
S-parameters back as JSON. Phase 2's patch sweep and Phase 4's spacing sweeps are
sweep-and-read-a-scalar studies that it can drive directly.

Two gaps to close before relying on it:

- **Reflection *phase*** — the bridge summarises S₁₁ magnitude. Phase 2 needs the phase zero
  crossing, a small addition to `summarize_s11`.
- **Efficiency treepaths** — radiation/total efficiency are far-field tree items whose exact
  paths are unverified. Confirm against a solved project before trusting them in a sweep.

The Floquet-port setup stays **manual** (as the macro's own notes say — it is version-specific
and safer clicked than scripted). Automation picks up after the first cell solves by hand.

---

## 3a. Measured on-body baseline (2026-07-23)

Supersedes spec §5.5, whose numbers came from a mistuned antenna and a truncated
phantom. Model: `work/onbody-tune.cst`, `serp_R = 9.05 mm`, `body_gap = 1 mm`,
`musc_t = 70 mm` (≥3 penetration depths), `body_ext = 25 mm`, `z_amp = 0`.

**Tuned design point** (FD, tetrahedral):

| | |
|---|---|
| Resonance | 2.425 GHz @ −15.6 dB |
| −10 dB band | 2.292–2.577 GHz (**11.7 %**) — covers all of BLE with margin |
| Radiation efficiency | **5.93 %** |
| Total efficiency | **5.77 %** |

Total ≈ radiation, so the antenna **can** be matched on-body across the band. The
old 1–6 % total figures were dominated by mismatch from mistuning, not by a
property of the design.

**Where the power goes** (fraction of accepted, at 2.44 GHz):

| Sink | Share |
|---|---|
| Muscle | 45.8 % |
| Skin | 33.1 % |
| Fat | 7.1 % |
| **Tissue subtotal** | **86.1 %** |
| PDMS substrate | 5.3 % |
| EGaIn conductor | 2.8 % |
| Radiated | 5.9 % |

This is the quantitative case for the AMC: **86 % of accepted power is absorbed by
the body**, and everything else combined is 8.1 % — consistent with the ~90 %
free-space radiation efficiency of §5.4. The conductor and substrate are not the
problem; the body is. Confirms §4.2's "don't over-engineer the metal".

**Cross-solver check.** Hex TD and tetrahedral FD agree on efficiency
(6.27 %/5.16 % vs 5.93 %/5.77 %) but not on resonance (**2.271 vs 2.425 GHz**, 6.3 %
apart) — hex staircases the curved swept channel. Quote the tetrahedral resonance;
treat `serp_R = 9.05` as carrying a few percent of mesh uncertainty, not as exact.

**Link budget.** At 5.77 % total (−12.4 dB), 0 dBm TX, 0 dBi RX, −90 dBm sensitivity:
2 m → −58.6 dBm (**31 dB margin**); 10 m → −72.6 dBm (17 dB). The bare loop closes a
short-range BLE link comfortably. **The AMC is where the headroom is, not where the
viability is** — consistent with §5.6's own recommendation to ship bare for
short-range and treat the AMC as future work.

### SAR

Requires a **hex mesh** (CST refuses on tets) and a **density on every tissue**
(`.Rho`) — both were missing and are now fixed in `cst/add-tissue-phantom.vba`.
The substrate must NOT get a density: CST classes any material with ρ > 0 as
biological tissue, which put the reported peak inside the PDMS.

Peak located at z ≈ −2.2 mm, inside the skin, under the antenna. Per watt
*stimulated*, `Constant volume` averaging, tissue subvolume, 14.1 M cells:

| Averaging | Peak SAR | 1 mW | 2.5 mW | 10 mW |
|---|---|---|---|---|
| 1 g | 133.4 W/kg/W | 0.13 | 0.33 | **1.33** (FCC limit 1.6) |
| 10 g | 54.3 W/kg/W | 0.054 | 0.14 | 0.54 (ICNIRP limb 4.0) |

Add ~5 % if evaluated at resonance rather than at 2.44 GHz. **Comfortable at
0…+4 dBm; marginal against FCC 1 g at +10 dBm.**

Mesh convergence is good: 2.0 M → 14.1 M cells moved 1 g peak by 3.8 % and 10 g by
0.4 %.

**Caveat — not a compliance figure.** Every regulatory averaging method fails with
*"Subvolume iteration failed in N cells"* — the cube-growing algorithm cannot form
valid averaging cubes near the finite phantom's outer faces, and CST aborts the
whole calculation rather than skipping those cells. Only `Constant volume` (a
fixed-size cube, **not** a regulatory method) completes.

Tested exhaustively before concluding this — all combinations of:

| Axis | Values tried |
|---|---|
| Method | IEC/IEEE 62704-1, IEEE C95.3, CST C95.3, CST Legacy, Constant volume |
| Averaging mass | 1 g, 10 g |
| Evaluation volume | full domain, tissue-only subvolume (±30 mm, z −60…−2) |
| `volaccuracy` | 0.05, 0.2, 0.3, 0.5 |
| Mesh | 2.0 M cells, 14.1 M cells |
| Substrate ρ | 1030 (counted as tissue), 0 (excluded) |

Only `Constant volume` ever succeeds. **Route to a compliance-grade number:** a
substantially larger phantom (so no averaging cube sits near a face — `body_ext`
of order the 10 g cube edge, ~21 mm, plus margin) and finer tissue meshing. Note
the phantom also has to stay physically sensible: a real forearm is ~40–60 mm
across with bone, so an arbitrarily large flat slab trades one modelling error for
another. Quote the values above as engineering estimates.

Also note the low-power exemptions likely apply: FCC KDB 447498's exclusion
`[P(mW)/d(mm)]×√f(GHz) ≤ 3.0` gives 0.79 at 1 mW and 1.98 at 2.5 mW (excluded) but
7.91 at 10 mW (not excluded); EN 62479 exempts ≤20 mW in the EU. **Verify against
current revisions before publishing.**

---

## 4. Open risks

1. **Size may kill it regardless.** Even Route B at ~12 mm cells gives a 36 mm 3×3 against a
   23 mm antenna. Decide the acceptable footprint *before* Phase 3, not after.
2. **AMC bandwidth vs on-body detuning.** Skin pulled the bare loop 2.44 → ~1.35 GHz (§5.5). If
   the AMC's ±90° band is narrower than the on-body shift, the two mistune independently and
   the stack fails. Check the band in Phase 2 before building the array.
3. **The efficiency figures are hypotheses.** 40–70 % is quoted from published rigid AMCs; the
   mesh-ground estimates in §5.6 are explicitly untested.
4. **Stretch detunes the AMC too.** The strain analysis (§4.4) covers the loop only. A stretched
   AMC array changes `cell` and therefore its resonance — likely the harder problem, since
   `a/λ_z ≈ 0.183` compensation has no obvious analogue for a patch grid.
