# Z-Wave Revival — Handoff

**Status: in progress, 2026-07-26.** Read this together with
[`DESIGN-EVOLUTION.md`](DESIGN-EVOLUTION.md).

---

## Why we came back to the z-wave

The project's premise is **stable BLE frequency under stretch**. The flat serpentine does **not**
deliver that, and we proved it two ways:

1. **CST strain sweep**: resonance shifts **−8.8 % at 20 % strain**, leaving the BLE band entirely
   (full coverage only holds to ~10 % strain).
2. **Analytically, the meander shape gives no help at all.** Compared against a plain circular loop
   of *equal path length* under identical affine strain:

   | Strain | Serpentine Δf | Plain circle Δf | Difference |
   |---|---|---|---|
   | 10 % | −2.672 % | −2.727 % | 0.06 % |
   | 20 % | −5.678 % | −5.778 % | **0.11 %** |

   **Essentially identical.** An affine stretch scales a curve by a factor set only by its local
   *tangent direction*, and both shapes are isotropic in tangent direction — so both gain the same
   fractional length. **Meandering redistributes where the length sits, not how it scales.** No
   in-plane geometry can escape this.

The only way out is to break the in-plane isotropy — go **out of plane**. Under stretch the
elastomer contracts in z (incompressible, ν ≈ 0.5), which **flattens** the z-wave and releases arc
length at nearly the rate the in-plane stretch demands it. That is the whole mechanism.

**Analytical prediction: ~0.11 % drift at 20 % strain, vs 5.7 % flat — a ~50× improvement.**

## Design point

Substrate budget was raised to **6 mm** (from ≤3 mm), which is what makes this practical.

| Parameter | Value | Why |
|---|---|---|
| `serp_R` | 8.95 mm | inherited from the tuned flat design — **will need re-tuning**, see below |
| `z_amp` | **0.923 mm** | optimiser output at `z_cyc = 24` |
| `z_cyc` | **24** | see trade table |
| `sub_h` | **4.0 mm** | buries the ±0.923 mm envelope + cover, inside the 6 mm budget |
| `eps_r` / `tand` | 2.6 / 0.03 | Ecoflex-30 (still unverified — see evolution doc §6) |
| `chan_r` | 0.25 mm | Ø0.5 channel |

The optimum ratio **a/λ_z ≈ 0.183** is scale-invariant — it held across every `z_cyc` tested:

| `z_cyc` | `z_amp` | substrate needed | drift @20 % | crest curvature radius |
|---|---|---|---|---|
| 12 | 1.834 mm | 5.37 mm | 0.112 % | 1.40 mm |
| **24** | **0.923 mm** | **3.55 mm** | **0.112 %** | **0.69 mm** |
| 32 | 0.687 mm | 3.07 mm | 0.110 % | 0.52 mm |
| 48 | 0.458 mm | 2.62 mm | 0.110 % | 0.35 mm ⚠️ |

All give the same drift, so **pick on geometry, not RF**. `z_cyc = 24` was chosen because its crest
curvature radius (0.69 mm) is comfortably above the 0.25 mm tube radius — the old `z_cyc = 48`
design was marginal at 0.35 mm and CST warned about near self-intersection.

## ⚠️ The z-wave adds path length — expect to re-tune

3D path length is **≈153 mm** vs **≈121 mm** flat (+27 %), so the untuned design resonates low.

**MEASURED (2026-07-26):** at `serp_R = 8.95`, the built model solves to
**2.126 GHz, S₁₁ = −19.8 dB** — a clean single resonance, confirming the port fix below works.

**Re-tune: scale `serp_R` by 2.126/2.44 → start at `serp_R ≈ 7.80 mm`**, then iterate
(solve → read dip → scale by f_measured/2.44 → repeat). Two or three passes converged for the flat
design. Note the match is already deep (−19.8 dB), so the tuning problem is purely frequency.

## Manufacturability — resolved

Earlier notes said the z-wave was unmanufacturable. **That was true only of the two-cavity mould
in `Antenna Molds v3`** (one flat cap can only close a planar groove). The actual process is a
**3D-printed resin master with a flexible elastomer cast**, which can release moderately complex
geometry because the *part* flexes on demould. So a z-undulating channel is viable.

Two layouts, either workable:
- **Wave offset entirely above the bond plane** — one patterned half + flat cap, closest to the
  current process. Preferred.
- **Two matched halves**, each carrying half the wave, bonded at the mid-plane. Channel crosses the
  bond line, so alignment becomes critical.

Still to confirm on a real print: whether a Ø0.5 mm channel undulating ±0.923 mm actually releases
cleanly from resin.

## Where the work is

| File | State |
|---|---|
| `work/serp-zwave.vba` | z-wave + affine-strain parametric build macro. **Working** |
| `work/zwave.cst` | built from the above at the design point |
| `work/zwave-strain-sweep.vba` | 5-point strain sweep (0/5/10/15/20 %) |
| `work/strain_shape_compare.py` | the serpentine-vs-circle proof (no CST needed) |
| `work/plot_strain.py` | strain figure generator (reads cached results, no licence needed) |

### Bug already found and fixed — don't reintroduce it

The first z-wave build gave **S₁₁ = 0.00 dB flat across the whole band, at every strain point** —
total reflection. Cause: the z-wave was added to the *trace* block but not the *feed* block, so the
conductor ends sat at z ≈ +0.49 mm while the discrete port stayed pinned at z = 0. **The port was
floating in dielectric, touching nothing.**

Fix (already applied in `serp-zwave.vba`): the feed block now restores `z_amp`/`z_cyc` and computes
`p1z = lt * zamp * Sin(mzz * tA)`, `p2z = lt * zamp * Sin(mzz * tB)`, passing those to
`SetP1`/`SetP2`.

> **General rule: any change to the trace geometry must be mirrored in the feed block.** A flat
> ~0 dB S₁₁ across an entire sweep is the signature of a disconnected port, not a mistuned antenna.

## Next steps

1. ~~**Verify the port connects**~~ ✅ **DONE** — solves to 2.126 GHz, −19.8 dB. Model is sound.
2. **Re-tune `serp_R`** to bring resonance to 2.44 GHz — **start at 7.80 mm**.
3. **Re-run the strain sweep** and confirm drift is ~0.1 %, not ~5.7 %. **This is the money shot —
   it's the plot that proves the project's premise.**
4. **Add the real feed** (crest + fan-out stubs + wells + 2× SSMA), as was done for the flat design,
   then re-tune again. The feed detunes noticeably.
5. **Export the STL** for the resin master.

## Commands

```bash
# build
"C:\Program Files\Python310\python.exe" scripts/cst_bridge.py --quiet build \
    --project work/zwave.cst --macro work/serp-zwave.vba

# solve
"C:\Program Files\Python310\python.exe" scripts/cst_bridge.py --quiet solve \
    --project work/zwave.cst

# read results  (close the project in the GUI first, or reads get flaky)
"C:\Program Files\Python310\python.exe" scripts/cst_bridge.py --quiet results \
    --project work/zwave.cst --eff-at 2.44
```

**Environment reminders:** CST **2024** (the 2026 folder is a stub); Python **3.10** to match the
shipped `.pyd`; **VPN required** — the licence server is campus-internal (`27003@10.1.1.24`) and CST
hangs on a "Waiting for License" dialog without it. If a build or solve stalls with no log activity,
look for a modal dialog before assuming the solver is busy.
