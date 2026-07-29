# What could not be produced, and what each would cost

Nothing here is invented. Where a model does not exist, this says so.
One frequency-domain solve on the current mesh is **~13 minutes**.

## Does not exist at all — needs new models

| Request | Status | Cost to produce |
|---|---|---|
| **Free-space S11** (F3 baseline, items 8–10) | ❌ **no free-space model exists** — every solved project has the 3-layer phantom | 1 solve. Delete the tissue bricks, re-solve. **This is the one I would run first** — your VNA measurement was in free space, so nothing here is directly comparable to it |
| **Bend / conformal** (F5, F6, items 17–21) | ❌ **never simulated.** `work/serp-bend.vba` exists but no bend project was ever built or solved | 4 solves per plane (flat, R = 50/30/20). 8 solves ≈ 2 h for both planes, plus macro work to wrap the geometry |
| **Concentric-ring iteration** (F1 third trace) | ❌ **no CST model.** It exists only as a synthesis template in the web tool | 1 build + 1 solve, but the geometry would have to be re-derived |
| **Tolerance sweeps** (F16, items 32–33) | ❌ not run | 12 solves ≈ 2.6 h (ε_r ±20 %, `sub_h` ±2 mm, path 95/90/85 %, channel ±20 %) |
| **Antenna-to-skin separation sweep** (item 26) | ❌ not run | 4 solves ≈ 1 h. This is the evidence for the 6.5 mm thickness choice, which is currently asserted rather than shown |
| **SAR** (item 25) | ❌ not computed in any current project | 1 solve with a SAR monitor + IEEE averaging setup |

## Exists but not in usable form

| Request | Status | Cost |
|---|---|---|
| **Efficiency vs frequency** (F7, item 28) | ⚠️ **single point only.** Radiation efficiency is computed only where a farfield monitor exists, and the model has exactly one, at 2.44 GHz → 5.22 % | 1 re-solve with monitors every 50 MHz across 1.5–4.0 GHz |
| **Gain vs frequency** (F8) | ⚠️ same single-monitor limitation | same solve as above |
| **2D/3D patterns** (F9, F10, item 30) | ⚠️ **farfield results exist at 2.44 GHz** in `zwave-feed3` / `zwfinal-fab`, but `Plot.ExportImageToFile` and `Plot.StoreImage` are **not valid instructions in CST 2024**, so they cannot be exported programmatically | manual, ~30 s each: open project → select the farfield item → File → Export → Image |
| **Surface current** (F11) | ⚠️ likely present as a 3D field result at 2.44 | manual export, same route |
| **Peak gain / realised gain numbers** (item 28) | ⚠️ computable from the stored farfield, but not yet extracted | ~15 min of scripting, no solve |
| **Smith chart** (F15) | ✅ **derivable now** from `F3_S11_zwave_flat.csv` — no solve needed | ~15 min |

## Produced, with caveats

| Figure | Caveat |
|---|---|
| `F1_S11_iterations` | **2 traces, not 3.** No concentric-ring model exists |
| `F3_S11_zwave_flat` | **on-body, not free space.** Filename kept to match your request |
| `F4_S11_zwave_strain` | **bare loop, delta-gap feed** (`zwstrain85`), not the SSMA-fed design. Resonates ~2.17 GHz, not 2.45 — the *percentage* shift is the result, not the absolute frequency |
| `F2_deltaf_vs_strain` | ✅ the one fully controlled comparison — both sides identical except `z_amp` |

## F6 — the combined stretch + bend figure

This was flagged as the most important figure in the request, and it **cannot be
built**: there is no bend data at all. It needs the 8 bend solves above first.

One caution about the plan for it. The proposed conversion ε = t/(2R) with
t = 6.5 mm gives 6.5 %, 10.8 %, 16.3 % at R = 50/30/20 mm — but that is the strain
at the **outer surface** of the slab, while the conductor sits at the **mid-plane**,
where bending strain is **zero** by definition. On a symmetric neutral axis a pure
bend stretches the conductor far less than the surface formula suggests, so stretch
and bend points would **not** be expected to collapse onto one line — and if they
appear to, that is worth suspecting rather than celebrating. Bending also changes
the body standoff, which moves resonance independently of any conductor strain.

Worth building, but frame it as *"do two deformation modes agree?"* rather than
assuming they must.

## Model-setup screenshots (items 7, 12, 19, 24; F12)

Not produced. Geometry renders in this repo come from Python previews
(`deliverables/zwave-geometry-preview.png`, `zwave-gutter-plates.png`), not from
CST's 3D view — and CST 2024 blocks programmatic 3D image export by the same route
that blocks the farfield export. Annotated setup figures (layer stack, dimensioned
isometric, strain states side by side) need either manual CST screenshots or a
purpose-built Python renderer.

The **body model is fully specified** in `README.md` §2 — 3-layer flat phantom,
skin 2 / fat 5 / muscle 70 mm, 110 × 110 mm in plan, 1.0 mm gap from substrate
underside to skin (so **conductor-to-skin = 4.25 mm**), IT'IS/Gabriel values at
2.45 GHz, open boundaries with λ/8 background spacing. That is enough to draw F12
by hand without opening CST.
