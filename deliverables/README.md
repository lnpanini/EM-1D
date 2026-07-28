# Deliverables — final antenna design

The artifacts that matter, committed so everyone has them. See
[`../docs/DESIGN-EVOLUTION.md`](../docs/DESIGN-EVOLUTION.md) for the reasoning and
[`../docs/PRESENTATION-GUIDE.md`](../docs/PRESENTATION-GUIDE.md) for slide use.

> **🔴 2026-07-27 — the design is now the Z-WAVE, not the flat serpentine.**
> Files are grouped below by which design they belong to. The `serp-*` files are a
> previous iteration; the `zwave-*` files are current.
>
> **Before putting any figure on a slide**, check it against the provenance table in
> [`cst/README.md`](cst/README.md) — it lists every figure's project, run ID and
> geometry, and flags the two that show superseded models.

## CURRENT — z-wave design

| File | What it is |
|---|---|
| `zwave-antenna.step` | **Fabrication CAD** — Ecoflex slab + EGaIn network (loop, stubs, junction fillets, wells). B-rep, editable. Two solids: `Substrate`, `ChannelSolid` |
| `zwave-mould-concave-forms-upper.stl` | **Mould plate 1** — concave ring + Ø0.5 half-round channel ridge. Casts the **upper** layer. ⚠️ **not in git** — regenerate, see below |
| `zwave-mould-convex-forms-lower.stl` | **Mould plate 2** — the **convex** counterpart. Casts the **lower** layer, which is then **flipped** and bonded at the ring surface. ⚠️ **not in git** — regenerate, see below |
| `zwave-gutter-plates.png` | The two plates, top views coloured by height + radial sections |
| `zwave-gutter-section.png` | The concave ring cross-section, and why `z_cyc` must be 2 × `serp_n` |
| `zwave-geometry-preview.png` | The antenna: top / side / end / feed detail |
| `strain-zwave-vs-flat.png` | **The strain result** — z-wave vs a flat control at *matched* geometry (`serp_R` 8.5, `sub_h` 6.508, differing only in `z_amp`) |
| `subh-cover-explained.png` | What `sub_h` and `cover` mean, and why cover is held fixed |

## The current design

| Parameter | Value |
|---|---|
| `serp_R` | **8.5 mm** |
| `z_amp` / `z_cyc` | **1.004 mm** (= 0.1181·`serp_R`) / **24** |
| `chan_r` / `fillet_r` | 0.25 mm (Ø0.5 channel) / 0.25 mm |
| Substrate `sub_h` | **6.508 mm** Ecoflex-30 |
| Cover over crests | **2.00 mm** each face |
| Feed | crest gap → 2 stubs **flat in the land plane at z = +1.004** → 2.41 mm deep wells → 2 × SSMA differential |

**Simulated performance** (on-body, full feed modelled): S<sub>dd11</sub> **−6.22 dB** @ 2.44 GHz,
radiation efficiency **5.22 %**, delivered power **3.97 %**.
**Strain: −7.82 % at 20 %**, vs **−10.38 %** for a flat control on the same substrate — a **25 %
reduction. Strain-tolerant, not strain-invariant.**
⚠️ ~1.5 % mesh uncertainty — don't quote resonance tighter than ±0.03 GHz.

## PREVIOUS ITERATION — flat serpentine (valid measurements, superseded design)

| File | What it is |
|---|---|
| `serp-antenna-fab-r025.step` | Flat-design fabrication CAD |
| `serp-channel-fab-r025.stl` | Flat-design channel volume (raised positive master) |
| `sdd11-final.png` | Flat design S<sub>dd11</sub> — 2.423 GHz, ≈ −9 dB |
| `strain-sweep.png` | Flat design strain sweep, −8.8 % at 20 % |
| `param-sim-sparams.s2p` | Flat design raw 2-port S-parameters (Touchstone, 50 Ω) |

Flat design point: `serp_R` 8.95, `sub_h` ≈1.95, `z_amp` 0.

## SUPERSEDED — delete when convenient

`zwave-channel-master.stl`, `zwave-substrate.stl`, `zwave-mould-cavity.stl`,
`zwave-mould.step` — these are from an earlier **sacrificial-core** mould concept
for the z-wave, replaced by the two gutter plates above. Kept only so nobody
wonders where they went; they are not part of any current process.

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

## Getting the mould plates (they are not in git)

The two plate STLs are 31 MB each and are **derived**, so the generator is committed
instead of the meshes. They need **no CST licence** — pure Python, ~3 minutes:

```bash
python scripts/build_gutter_mold.py 8.5 6.508
```

The two arguments are `serp_R` and `sub_h`; it writes both plates straight into this
folder. Re-run it with different values if the design point moves — that is the
intended workflow, and it keeps the plates in step with the antenna automatically.

To preview what you get:

```bash
python scripts/preview_gutter_plates.py
```

## Reproducing the analysis

All pure Python, no CST needed:

| Command | What it shows |
|---|---|
| `python scripts/gutter_check.py` | The meander really does rest on a parabolic concave ring (to 19 µm), and why `z_cyc` must be 2 × `serp_n` |
| `python scripts/mold_parting_check.py` | Why no **flat** parting plane can mould the channel (best cuts 33 % of the loop) |
| `python scripts/drift_decompose.py` | Why the z-wave cancels far less drift than the arc-length model promised |
| `python scripts/explain_subh_cover.py` | What `sub_h` and `cover` mean, and why cover is held fixed |

Needing CST (and the licence VPN): `scripts/scan_feed_match.py` (match/efficiency
scans), `scripts/run_strain_at.py` (strain sweeps), `scripts/export_zwave_cad.py`
(STEP/STL export), `scripts/audit_efficiency.py` (delivered-power ranking).
Model definitions are the VBA macros in `cst/`.

## Not committed

The CST projects and solver output live in `work/` (~22 GB, gitignored). To regenerate them, use
`scripts/cst_bridge.py` with the macros in `cst/`. Everything needed to rebuild is in the repo; only
the solved field data is excluded.
