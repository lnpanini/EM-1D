# Deliverables — final antenna design

The artifacts that matter, committed so everyone has them. See
[`../docs/DESIGN-EVOLUTION.md`](../docs/DESIGN-EVOLUTION.md) for the reasoning and
[`../docs/PRESENTATION-GUIDE.md`](../docs/PRESENTATION-GUIDE.md) for slide use.

| File | What it is |
|---|---|
| `serp-antenna-fab-r025.step` | **Final fabrication CAD** — Ecoflex slab + EGaIn loop + fan-out stubs + closed junctions + connector wells |
| `serp-channel-fab-r025.stl` | **The channel-volume solid** — loop + stubs + wells merged into one body. This is the geometry to print as the mould's **raised positive master**. Nothing is dissolved: you cast over it, peel, then bond a flat cap layer to seal the groove (see `docs/DESIGN-EVOLUTION.md` §7) |
| `sdd11-final.png` | Differential reflection S<sub>dd11</sub> vs frequency (the headline result plot) |
| `param-sim-sparams.s2p` | Raw 2-port S-parameters (Touchstone, real/imag, 50 Ω). Load in any RF tool, or re-plot |

## The design these correspond to

| Parameter | Value |
|---|---|
| `serp_R` | 8.95 mm |
| `chan_r` | 0.25 mm (Ø0.5 channel) |
| `fillet_r` | 0.25 mm (junction blend, flush with trace) |
| Substrate | Ecoflex-30, ≈1.95 mm |
| Feed | crest → 2 × 0.5 mm stubs → EGaIn wells at (14, ±4) mm, 2 × SSMA differential |
| Flat (`z_amp` = 0) | yes — soft lithography is planar |

**Simulated performance** (on-body, full feed modelled): S<sub>dd11</sub> resonance **2.423 GHz**,
match **≈ −9 dB** flat across BLE, radiation efficiency **≈ 6 %**.
⚠️ Carries ~1.5 % mesh uncertainty — don't quote resonance tighter than ±0.03 GHz.

## Computing S<sub>dd11</sub> yourself from the .s2p

The antenna is **balanced**, so single-ended S₁₁ is not its match. Combine:

```
Sdd11 = (S11 − S12 − S21 + S22) / 2        # complex, then take 20·log10|·|
```

Or with [scikit-rf](https://scikit-rf.org):

```python
import skrf as rf
ntwk = rf.Network('param-sim-sparams.s2p')
mm = ntwk.se2gmm(p=1)      # 2 single-ended -> 1 differential + 1 common
mm.plot_s_db(m=0, n=0)     # Sdd11
```

**S<sub>dd11</sub> is referenced to 100 Ω**, not 50 Ω — see `docs/DESIGN-EVOLUTION.md` §4 before
comparing against a measurement.

## Not committed

The CST projects and solver output live in `work/` (~22 GB, gitignored). To regenerate them, use
`scripts/cst_bridge.py` with the macros in `cst/`. Everything needed to rebuild is in the repo; only
the solved field data is excluded.
