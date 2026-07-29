# What exists, and what still doesn't

Updated 2026-07-29 after the free-space and farfield-monitor solves.
One frequency-domain solve on the current mesh is **5–13 minutes**.

## ✅ Produced

| Figure | Source | Note |
|---|---|---|
| `F1_S11_iterations` | `param-sim` + `zwave-feed3` r10 | **2 traces, not 3** — no concentric-ring model |
| `F2_deltaf_vs_strain_geometries` | `zwstrain85` + `zwflatB` + `flex-strain` | the one **fully controlled** comparison |
| `F3_S11_zwave_flat` | `zwave-feed3` r10 | **on-body** |
| `F4_S11_zwave_strain` | `zwstrain85` | bare loop, delta-gap, resonates ~2.17 GHz |
| `F7_efficiency_vs_freq` | `zwfinal-fab` (15 monitors) | rad / delivered / CST-total, on body |
| `F12_body_setup` | drawn from the macro's parameters | layer stack, ε/σ, separations |
| `F13_S11_freespace_vs_onbody` | `zwfree` + `zwave-feed3` r10 | |
| `F14_efficiency_onbody` | both | **67.2 % → 5.22 %** |
| `F15_smith_zwave` | `zwave-feed3` r10 | VSWR 2/3 circles |
| `F17_loss_budget` | `zwave-feed3` r10 power results | where the 95 % goes |
| `F18_simulated_vs_measured` | `zwfree` + supplied VNA points | model is **413 MHz low** |

## ❌ Still missing — needs new models

| Request | Why | Cost |
|---|---|---|
| **Bend / conformal** (F5, **F6**, items 17–21) | **never simulated.** `work/serp-bend.vba` exists but no bend project was built | 4 solves per plane; 8 ≈ 1.5 h, plus macro work to wrap the geometry |
| **Concentric-ring iteration** (F1 third trace) | **no CST model** — web-tool synthesis template only | 1 build + 1 solve |
| **Tolerance tornado** (F16, items 32–33) | not run | 12 solves ≈ 2 h |
| **Skin-separation sweep** (item 26) | not run — this is the evidence for the 6.5 mm thickness choice, currently asserted | 4 solves ≈ 45 min |
| **SAR** (item 25) | no SAR monitor in any project | 1 solve + IEEE averaging setup |

## ⚠️ Blocked by CST 2024, not by missing data

**Gain and radiation patterns (F8, F9, F10, F11, item 28, item 30).**

The farfield results **exist** — there are now 15 monitors from 1.8–3.2 GHz in
`zwfinal-fab.cst`. Two independent obstacles:

1. **`cst.results` exposes only 1D results.** After the 15-monitor solve, the tree
   still shows zero farfield or gain entries. Efficiency came through because CST
   files it under `1D Results\Efficiencies`; gain is not filed there.
2. **`Plot.ExportImageToFile` and `Plot.StoreImage` are not valid instructions in
   CST 2024**, so the pattern plots cannot be rendered programmatically either.

**The route that would work** is VBA `FarfieldPlot.CalculateList` / `GetList`,
writing values to a text file from VBA and plotting them in Python. Not yet
attempted — roughly an hour, no solve needed.

**Manual fallback**, ~30 s per figure: open the project, select the farfield item
in the tree, **File → Export → Image**.

## A caution about F6, the combined stretch + bend figure

The proposed conversion ε = t/(2R) with t = 6.5 mm gives 6.5 %, 10.8 %, 16.3 % at
R = 50/30/20 mm — but that is the strain at the **outer surface**, and the conductor
sits at the **mid-plane, where bending strain is zero by definition**. A pure bend
therefore stretches the conductor far less than the surface formula implies, so
stretch and bend points should **not** be expected to collapse onto one line. If
they appear to, suspect it. Bending also changes body standoff, which moves
resonance independently of conductor strain.

Still worth building — but frame it as *"do two deformation modes agree?"*, not as
a confirmation you expect to succeed.
