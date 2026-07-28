# Native CST result plots

Exported from CST's own renderer (1600×1000), **not screen captures**.
Regenerate with `scripts/export_cst_plots.py` — caveats at the bottom.

> ## 🔴 Corrected 2026-07-29 — the previous version of this file had the two z-wave models backwards
>
> It labelled `zwave-feed2` as **"MATCHED ← use these"** and `zwave-feed3` as
> **"MIS-TUNED"**. Both calls were wrong:
>
> 1. **`zwave-feed2` is the *pre-fix* geometry.** Its parameters are byte-identical
>    to feed3's, but its model history is not: it has **0.66 mm wells** (`land_z -
>    chan_r`) and **stubs that do not lie in the land plane** — the two things that
>    were explicitly fixed afterwards. It is not the antenna being built.
> 2. **`zwave-feed3` is not mis-tuned.** Its history is **byte-identical** to
>    `work/zwfinal-fab.cst`, the project the STEP and mould plates came from. It was
>    judged "mis-tuned" because its |S<sub>dd11</sub>| minimum sits at 2.843 GHz —
>    but this antenna **has no in-band dip by construction** (see below), so dip
>    location is the wrong criterion. Judged at 2.44 GHz, feed3 beats feed2.
>
> 3. **Every `*-VSWR.png` was a byte-identical copy of the matching `*-S11.png`.**
>    Not a VSWR plot at all. **CST stores no VSWR result item** — it renders VSWR
>    on demand in the GUI, so `export_cst_plots.py` could never have produced one,
>    and the files were duplicated instead. All three have been **deleted** and
>    replaced by `vswr-flat-vs-zwave.png`, computed from S<sub>dd11</sub>.
>
> `sdd11-flat-vs-zwave.png` and the VSWR figure are regenerated; `zwave-final-*`
> is re-exported at the design point. The `zwave-matched-*` PNGs are unchanged and
> are now labelled for what they actually show.

## Which antenna is in which figure

Every figure, traced to its project, run ID and geometry. Runs are identified by
**matching parameters**, never by `max(run_id)` — CST puts the current parameter
set in run 0 and stored combinations at higher ids.

| Figure | Project | run | `serp_R` | `sub_h` | `z_amp` | Feed modelled | Use? |
|---|---|---|---|---|---|---|---|
| `flat-final-*.png` | `param-sim.cst` | 0 | 8.95 | 1.948 | — flat | full 2×SSMA | ✅ the flat design |
| `sdd11-flat-vs-zwave.png` | `param-sim` + `zwave-feed3` | 0 + 10 | 8.95 / **8.50** | 1.948 / **6.508** | — / **1.004** | full 2×SSMA | ✅ **regenerated** |
| `vswr-flat-vs-zwave.png` | `param-sim` + `zwave-feed3` | 0 + 10 | 8.95 / **8.50** | 1.948 / **6.508** | — / **1.004** | full 2×SSMA | ✅ **new** |
| `zwfinal-fab-*.png` | `zwfinal-fab.cst` | 0 | **8.50** | **6.508** | **1.004** | full 2×SSMA | ✅ **the design point** |
| `zwave-final-*.png` | `zwave-feed3.cst` | **all 13** | 7.5–9.1 | 3.0 & ~6.5 | varies | full 2×SSMA | ❌ 13 curves overlaid |
| `zwave-matched-*.png` | `zwave-feed2.cst` | 0 | 7.7 | 3.0 | 0.910 | 2×SSMA, **pre-fix** | ❌ superseded geometry |
| `zwave-S11-all-strains.png` | `zwstrain85.cst` | 0–5 | 8.5 | 6.508 | 1.004 | **delta-gap, no SSMA** | ✅ strain only |
| `zwave-radiation-efficiency.png` | `zwstrain85.cst` | 0–5 | 8.5 | 6.508 | 1.004 | delta-gap | ✅ strain only |
| `zwave-total-efficiency.png` | `zwstrain85.cst` | 0–5 | 8.5 | 6.508 | 1.004 | delta-gap | ✅ strain only |
| `../strain-zwave-vs-flat.png` | `zwstrain85` + `zwflatB` | 1–5 | 8.5 / 8.5 | 6.508 / 6.508 | **1.004 / 0** | delta-gap | ✅ **the controlled pair** |
| `../sdd11-final.png` | `param-sim.cst` | 0 | 8.95 | 1.948 | — flat | full 2×SSMA | ✅ the flat design |
| `../strain-sweep.png` | `flex-strain.cst` | 1–5 | **9.05** | 1.948 | — flat | delta-gap | ⚠️ see footnote |

Shared across every row: `serp_n` 12, `amp_ratio` 0.2, `serp_ratio` 0.05,
`chan_r` 0.25 mm, `feed_gap` 1.0 mm, `body_gap` 1.0 mm, phantom `skin_t` 2 /
`fat_t` 5 / `musc_t` 70 mm.

### The design point, from `zwfinal-fab.cst`

| Quantity | Value |
|---|---|
| S<sub>dd11</sub> @ 2.44 GHz | **−6.22 dB** (worst across BLE −6.06 dB) |
| Differential VSWR @ 2.44 | **2.91** |
| Z<sub>diff</sub> @ 2.44 | 282.7 + 45.7j Ω |
| Radiation efficiency @ 2.44 | **5.22 %** — *identical on both ports* |
| Total efficiency, per port | 2.28 % (single-port drive — **not** the differential condition) |
| **Delivered, differential** | 5.22 % × (1 − \|S<sub>dd11</sub>\|²) = 5.22 % × 0.761 = **3.97 %** |

Both ports reporting **5.22 %** to three figures is the mirror-symmetry check: it
is what confirms the `Cos` (even) z-wave preserved the `y = 0` plane the
differential mode needs. An odd `Sin` wave gave 5.08 % / 5.15 %.

> ⚠️ **Two traps in the exported `zwfinal-fab-*.png` files.**
>
> **`zwfinal-fab-S11.png` is single-ended**, and it dips to −17.5 dB at **1.89 GHz**.
> That is *not* the antenna resonating in the wrong place — S₁₁ on one port of a
> balanced pair is not this antenna's match. The differential quantity is in
> `sdd11-flat-vs-zwave.png`. Do not put the single-ended plot on a slide without
> that explanation; it invites exactly the wrong question.
>
> **The two efficiency PNGs are a single data point, not a curve.** CST computes
> efficiency only where a farfield monitor exists, and this model has one, at
> 2.44 GHz. The files are evidence that 5.22 % came from CST — **quote the number,
> do not show the plot.** An efficiency-vs-frequency curve would need extra
> farfield monitors and another ~13 min solve.

> ⚠️ **`../strain-sweep.png` footnote.** The flat design's −8.8 % strain result — the
> number that triggered the whole z-wave revival — was measured on an **earlier flat
> model**: `serp_R` 9.05 (not 8.95), `serp_A` 1.81, `eps_r` **2.68** (not 2.6),
> `tand` **0.02** (not 0.03), no fillets. It is valid as *"the flat serpentine drifts
> badly"*, but do **not** put its −8.8 % on the same axis as the z-wave's −7.82 %.
> The correct flat baseline for that claim is **−10.38 %**, from `zwflatB` — same
> `serp_R`, same `sub_h`, same materials, `z_amp = 0`.

## The two comparisons, and which one is controlled

### 1. Strain — CONTROLLED ✅ `../strain-zwave-vs-flat.png`

| | z-wave (`zwstrain85`) | flat control (`zwflatB`) |
|---|---|---|
| `serp_R` | 8.5 mm | 8.5 mm |
| `sub_h` | 6.508 mm | 6.508 mm |
| `z_amp` / `z_cyc` | **1.004 mm** / 24 | **0** / 24 |
| `serp_A` / `serp_n` | 1.7 / 12 | 1.7 / 12 |
| `eps_r` / `tand` | 2.6 / 0.03 | 2.6 / 0.03 |
| f₀ at 0 % strain | 2.174 GHz | 2.620 GHz |
| f₀ at 20 % strain | 2.004 GHz | 2.348 GHz |
| **Drift at 20 %** | **−7.82 %** | **−10.38 %** |

**Every parameter is identical except `z_amp`.** That is what makes the 25 %
reduction attributable to the z-wave and nothing else. Both sides are **bare-loop,
delta-gap** models without the SSMA feed, and neither is tuned to 2.44 GHz — the
*percentage* is the result, not the absolute frequency.

### 2. Match — NOT controlled ⚠️ `sdd11-flat-vs-zwave.png`

| | flat (`param-sim`) | z-wave (`zwave-feed3` run 10) |
|---|---|---|
| `serp_R` | 8.95 mm | 8.50 mm |
| `sub_h` | **1.948 mm** | **6.508 mm** |
| `z_amp` / `z_cyc` | — (flat) | 1.004 mm / 24 |
| `serp_A` | 1.79 | 1.70 |
| `eps_r` / `tand` | 2.6 / 0.03 | 2.6 / 0.03 |
| Feed | 2 × SSMA differential | 2 × SSMA differential |
| S<sub>dd11</sub> @ 2.44 | **−9.17 dB** | **−6.22 dB** |
| Worst across BLE | −9.07 dB | −6.06 dB |
| Z<sub>diff</sub> @ 2.44 | 68 + 52j Ω | 283 + 46j Ω |
| Mismatch loss | 0.56 dB | **1.19 dB** |
| Radiation efficiency | ≈ 6 % | 5.22 % |

These are **two separately tuned designs on different substrates**, so the 3 dB gap
mixes the z-wave's own cost with the cost of the 6.5 mm slab it needs. It is *not* a
controlled experiment, and the figure says so on its face. Present it as
*"each design at its own optimum"*, and quote the **mismatch loss** (0.56 → 1.19 dB,
i.e. ~0.6 dB) rather than "−9 dB vs −6 dB", which sounds far worse than it is
against ~31 dB of link margin.

## Why there is no dip at 2.44 GHz

The z-wave's |S<sub>dd11</sub>| minimum sits at **2.767 GHz**, and that is expected.
A differentially fed loop has a **series resonance** low and an **anti-resonance**
high, with a broad monotonic response between them — there is no notch to land on
2.44. What "tuned" means here is that the impedance is placed to give the best
value *across BLE*: −6.22 dB at 2.44, never worse than −6.06 dB anywhere in band,
a 0.16 dB variation. Flat, not resonant.

Chasing the dip is the error that nearly made the first tuner scale `serp_R` the
wrong way — see [`../../docs/ZWAVE-FEED-FINDINGS.md`](../../docs/ZWAVE-FEED-FINDINGS.md) §2.

## Regenerating

```bash
python scripts/plot_sdd11_compare.py
```

Reads results only — **no CST licence needed**, no VPN. Writes
`deliverables/cst/sdd11-flat-vs-zwave.png` and prints both designs' numbers.

The native CST renders need the GUI and a licence:

```bash
python scripts/export_cst_plots.py work/zwfinal-fab.cst deliverables/cst
```

Two traps it handles, both of which cost time to find:

1. **CST writes an uncompressed BMP even when the filename ends `.png`** (6.4 MB
   each). The script converts to real PNG (~20 KB).
2. **Quiet mode must be OFF.** With no visible plot window CST renders garbage —
   the first attempt produced a 16390×59395 image. The project must be open and
   activated.

**Why `zwfinal-fab.cst` and not `zwave-feed3.cst`.** Exporting a 1D result from a
project that holds stored parameter combinations plots **every run at once** —
`zwave-final-S11.png` is 13 unlabelled curves spanning `serp_R` 7.5–9.1 across two
substrate families, which is why it cannot be used and why the earlier caption
("run 0, `serp_R` 8.3") did not describe it.

`zwfinal-fab.cst` is the fabrication project: its model history is **byte-identical**
(md5 `86a25313…`) to `zwave-feed3.cst`, but it had never been solved, so it holds
exactly **one** run. Solving it at the design point gives clean single-curve native
plots *and* means the project the STEP was exported from now carries its own
results. It reproduced feed3 run 10 exactly — S<sub>dd11</sub> −6.22 dB,
Z<sub>diff</sub> 282.7 + 45.7j Ω — which is also a useful reproducibility check.

## Not included: farfield radiation patterns

Farfield results **exist** in these projects (`Farfields\farfield (f=2.44) [1]`
and `[2]`) but could not be exported programmatically — `Plot.ExportImageToFile`
and `Plot.StoreImage` are not valid instructions in CST 2024.

**Export them by hand** (~30 s each): open the project, select the farfield item in
the tree, then **File → Export → Image**, or right-click the 3D view → *Export
Image*. Save here as `<design>-farfield-2p44.png`.

## A note on the raw S-parameter plots

`flat-final-S11.png`, `zwave-*-S11.png` and the VSWR plots are **single-ended**.
The antenna is balanced, so the meaningful quantity is

```
Sdd11 = (S11 − S12 − S21 + S22) / 2
```

which is **not** any one curve on those plots. Use `sdd11-flat-vs-zwave.png` and
`../sdd11-final.png` for the match, and see `docs/DESIGN-EVOLUTION.md` §4.
