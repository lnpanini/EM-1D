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
> Only `sdd11-flat-vs-zwave.png` has been regenerated. The `zwave-matched-*` and
> `zwave-final-*` PNGs are unchanged and are now labelled for what they actually
> show.

## Which antenna is in which figure

Every figure, traced to its project, run ID and geometry. Runs are identified by
**matching parameters**, never by `max(run_id)` — CST puts the current parameter
set in run 0 and stored combinations at higher ids.

| Figure | Project | run | `serp_R` | `sub_h` | `z_amp` | Feed modelled | Use? |
|---|---|---|---|---|---|---|---|
| `flat-final-*.png` | `param-sim.cst` | 0 | 8.95 | 1.948 | — flat | full 2×SSMA | ✅ the flat design |
| `sdd11-flat-vs-zwave.png` | `param-sim` + `zwave-feed3` | 0 + 10 | 8.95 / **8.50** | 1.948 / **6.508** | — / **1.004** | full 2×SSMA | ✅ **regenerated** |
| `zwave-final-*.png` | `zwave-feed3.cst` | 0 | **8.3** | **6.461** | 0.980 | full 2×SSMA | ⚠️ right model, **wrong run** |
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
python scripts/export_cst_plots.py work/param-sim.cst deliverables/cst
```

Two traps it handles, both of which cost time to find:

1. **CST writes an uncompressed BMP even when the filename ends `.png`** (6.4 MB
   each). The script converts to real PNG (~20 KB).
2. **Quiet mode must be OFF.** With no visible plot window CST renders garbage —
   the first attempt produced a 16390×59395 image. The project must be open and
   activated.

**Known gap:** `zwave-final-*.png` show feed3 **run 0** (`serp_R` 8.3, `sub_h`
6.461), not the design point at run 10. Re-exporting them means opening
`zwave-feed3.cst`, selecting run 10's parameter combination in the parametric
result view, and re-running the export.

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
