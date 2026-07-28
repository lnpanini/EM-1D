# Native CST result plots

Exported directly from CST's own renderer (1600×1000), **not screen captures**.
Regenerate with `scripts/export_cst_plots.py` — see the caveats at the bottom.

## Final flat serpentine — `work/param-sim.cst`

`serp_R = 8.95 mm`, Ecoflex, 2 × SSMA differential feed, on-body phantom.

| File | Shows |
|---|---|
| `flat-final-S11.png` | Raw 2-port S-parameters |
| `flat-final-VSWR.png` | VSWR |
| `flat-final-radiation-efficiency.png` | Radiation efficiency |
| `flat-final-total-efficiency.png` | Total efficiency |

Headline (differential, computed from the raw S-params): **S<sub>dd11</sub> 2.423 GHz, ≈ −9 dB,
radiation efficiency ≈ 6 %**.

> ⚠️ These are **single-ended** S-parameters. The antenna is balanced, so the meaningful quantity is
> **S<sub>dd11</sub> = (S₁₁ − S₁₂ − S₂₁ + S₂₂)/2**, which is *not* any one curve on this plot. See
> `../sdd11-final.png` for the differential result, and `docs/DESIGN-EVOLUTION.md` §4.

## Z-wave design — `work/zwave-feed3.cst`

| File | Shows |
|---|---|
| `zwave-final-S11.png` | Raw 2-port S-parameters |
| `zwave-final-VSWR.png` | VSWR |
| `zwave-final-radiation-efficiency.png` | Radiation efficiency |
| `zwave-final-total-efficiency.png` | Total efficiency |

> ⚠️ **This is `serp_R = 8.3 mm`, `sub_h = 6.46 mm` — the closest *solved* iteration**, not the exact
> final design point (`serp_R = 8.5`, `sub_h = 6.508`) quoted in `../README.md`. The exact final
> geometry lives in `work/zwfinal-fab.cst`, which was built but never solved. Re-solve it and
> re-export if you need the numbers to match the headline exactly.

## Z-wave strain sweep — `work/zwstrain85.cst`

| File | Shows |
|---|---|
| `zwave-S11-all-strains.png` | **S₁₁ at 0 / 5 / 10 / 15 / 20 % strain, all five curves** |
| `zwave-radiation-efficiency.png` | Radiation efficiency across the same runs |
| `zwave-total-efficiency.png` | Total efficiency across the same runs |

> ⚠️ This sweep sits at **~2.0–2.2 GHz, not 2.44** — it is the strain-study geometry (pre-feed),
> where the *percentage* shift is the point, not the absolute frequency. Do not caption it as the
> tuned design's performance.

Result: resonance moves ≈ **−7.8 % at 20 % strain**, versus **−10.4 %** for a flat control — a ~25 %
reduction. **Strain-tolerant, not strain-invariant.** The analytical kinematic model predicted
~0.11 %, so full-wave is ~70× worse; the affine model badly overestimated the compensation.

## Not included: farfield radiation patterns

Farfield results **exist** in these projects (`Farfields\farfield (f=2.44) [1]` and `[2]`) but could
not be exported programmatically — `Plot.ExportImageToFile` and `Plot.StoreImage` are not valid
instructions in CST 2024, and `ExportImageToFile` is not callable bare.

**Export them by hand** (~30 s each): open the project, select the farfield item in the tree,
then **File → Export → Image**, or right-click the 3D view → *Export Image*. Save into this folder
as `<design>-farfield-2p44.png`.

## Regenerating

```bash
python scripts/export_cst_plots.py work/param-sim.cst deliverables/cst
```

Two traps it handles, both of which cost time to find:

1. **CST writes an uncompressed BMP even when the filename ends `.png`** (6.4 MB each). The script
   converts to real PNG (~20 KB).
2. **Quiet mode must be OFF.** With no visible plot window CST renders garbage — the first attempt
   produced 16390×59395 nonsense. The project must be open and activated.
