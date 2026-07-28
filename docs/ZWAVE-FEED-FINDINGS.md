# Z-Wave + Real Feed — Findings (2026-07-27)

Companion to `ZWAVE-STRAIN-FINDINGS.md`. That one covers the strain premise; this
one covers adding the real 2-port SSMA differential feed to the z-wave loop.

**Headline: the feed works and is correctly connected, but the differential match
reaches only ≈ −6.3 dB vs the flat design's −9.2 dB.** In real terms that is
**0.6 dB of extra mismatch loss** — negligible against the ~31 dB link margin — but
it is a genuine, quantifiable cost of the z-wave, and its cause is structural.

---

## 1. Two real bugs found and fixed

**(a) Port floating — avoided by mirroring z into the feed block.** The handoff's
warning was heeded: the loop terminals sit off the z = 0 plane, so the stubs start
at each terminal's true `(x, y, z)` and ramp to the connector plane. Verified by
the raw S11 span (−21.6 … −1.4 dB). A flat ~0 dB S11 would have meant a
disconnected port; we never saw one.

**(b) Broken mirror symmetry — a real error, caught by the first solve.** The
bare-loop macro uses `z = z_amp·Sin(z_cyc·t)`, which is **odd** in `t`. The
in-plane curve is even in x and odd in y, so `t → −t` maps the structure to
`(x, −y, −z)` — a C2 rotation about x, **not** a mirror. With an odd z the two gap
terminals land at `z = +0.55` and `−0.55`: one nearer the body than the other, so
ports 1 and 2 are **not equivalent** and the differential mode is contaminated.
Measured Sdd11 was −4.3 dB, and the two ports' efficiencies differed (5.08 % vs
5.15 %).

Fix: `z = z_amp·Cos(z_cyc·t)`, which is **even**, so `t → −t` gives `(x, −y, +z)`
— a true `y = 0` mirror plane. Both terminals then sit at the same z (verified
Δz = 4e-15 mm) and the stubs are exact mirror images. After the fix both ports
report **identical** efficiency (5.25 % / 5.25 %), confirming exact symmetry.
This is a phase-only change: amplitude and z-wavelength are untouched, so the
`a/λ_z` strain optimum is unaffected.

> **Generalised rule worth keeping:** for a differentially-fed structure, any
> out-of-plane modulation must be **even** in the loop parameter, or it destroys
> the mirror plane the differential mode relies on. Mirroring the geometry into
> the feed block is necessary but *not sufficient* — the symmetry class matters too.

**(c) A third trap, avoided:** `pad_x` was a fixed 14.0 mm inherited from the flat
design. With the z-wave loop smaller (serp_R 7.5 vs 8.95) that stretched the stubs
~25 % longer than the proven feed. Made it track the loop (`pad_x = outer_r +
pad_run`), restoring stub length to 4.91 mm vs the flat design's ~4.85 mm. Note
`pad_x` is now an *expression* parameter, so the VBA re-derives it from doubles
rather than calling `RestoreDoubleParameter` on it — the same convention `pad_h`
already used, and a real failure mode (it would silently return 0 and put the pads
at the origin).

## 2. Why the match tops out near −6.3 dB

**The tuning target was wrong at first, and the diagnosis needed impedance, not S11.**
There is no |Sdd11| dip to tune on: a differentially-fed loop has a series
resonance (Im(Zdiff) = 0, Re low) and an anti-resonance (Re very high) with a
broad monotonic |Sdd11| in between. The first tuner chased the |Sdd11| minimum,
which sat at the sweep edge, and **would have scaled serp_R the wrong way.**

Reading the proven flat design (`deliverables/param-sim-sparams.s2p`) settled it:

| | series res. | Re there | Zdiff @ 2.44 | Im/Re | best Sdd11 |
|---|---|---|---|---|---|
| **flat (proven)** | 2.185 GHz | 39 Ω | 68 + 52j | **0.76** | **−9.18 dB** @ 2.423 |
| z-wave, sub_h 4.0 | 2.211 | ~28 | 36 + 46j | 1.26 | −5.26 |
| z-wave, sub_h 3.2 | — | — | 34 + 35j | 1.015 | −5.41 |
| z-wave, sub_h 2.8 | — | — | 33 + 28j | 0.856 | −5.46 |
| **z-wave, sub_h 3.0, R 7.5** | — | — | **45 + 51j** | 1.13 | **−6.27** |

The flat design does **not** operate at series resonance — it operates *above* it,
in the inductive region, where Re has climbed to ~68 Ω, which is what best matches
the 100 Ω differential reference.

**The z-wave's problem is Q, and the cause is its substrate thickness.** `Im/Re` is
a Q signature. Most of this antenna's feed *resistance* comes from tissue
absorption (86 % of accepted power, DESIGN-EVOLUTION §2d). The z-wave needs a
thicker slab to bury its ±z envelope, which holds the loop further from the body,
reduces absorption, and raises Q. Thinning the substrate confirmed the mechanism
exactly — Im/Re fell 1.26 → 1.015 → 0.856 as sub_h went 4.0 → 3.2 → 2.8, reaching
the flat design's 0.76 — but the match barely improved, because Re stayed ~33 Ω.

**And the design is caught in a three-way bind:**

- Raising Re (better match) needs a **larger** serp_R, to sit further above series
  resonance.
- But `z_amp = 0.1181·serp_R` is coupled (to hold the strain optimum), so a larger
  serp_R **grows the z envelope**, which demands a **thicker** substrate.
- A thicker substrate **raises Q** and undoes the gain.

Measured directly: at sub_h 3.0, going serp_R 7.5 → 7.7 → 7.9 raised Re
(45 → 58 → 76 Ω, finally exceeding the flat design's 68 Ω) but Im outran it
(51 → 84 → 100 Ω), so the match got *worse*, not better. There is no serp_R that
delivers flat's (68 + 52j).

## 3. Final design point

The (sub_h, serp_R) scan at sub_h = 3.0 mm:

| serp_R | z_amp | cover | Re | Im | Im/Re | Sdd11 @2.44 | worst in BLE |
|---|---|---|---|---|---|---|---|
| 7.30 | 0.862 | 0.388 | 36.8 | +37.4 | 1.017 | −5.71 | −5.53 |
| 7.40 | 0.874 | 0.376 | 40.7 | +43.8 | 1.078 | −6.01 | −5.84 |
| **7.50** | **0.886** | **0.364** | **45.3** | **+51.2** | **1.130** | **−6.27** | **−6.13** |
| 7.70 | 0.909 | 0.340 | 57.6 | +84.2 | 1.462 | −5.55 | −5.54 |
| 7.90 | 0.933 | 0.317 | 75.5 | +100.5 | 1.332 | −5.82 | −5.81 |

**FINAL: `serp_R` = 7.5 mm, `z_amp` = 0.886 mm, `z_cyc` = 24, `sub_h` = 3.0 mm,
`pad_run` = 3.26 (→ `pad_x` = 12.26), `chan_r` = 0.25, `fillet_r` = 0.25.**

| Quantity | Value |
|---|---|
| Sdd11 @ 2.44 GHz | **−6.27 dB** |
| Worst Sdd11 across BLE (2.400–2.4835) | **−6.13 dB** (flat across the band) |
| Zdiff @ 2.44 | 45.3 + 51.2j Ω |
| Scc11 @ 2.44 | ≈ −1.6 dB (common mode reflected, as intended) |
| Radiation efficiency @ 2.44 | **5.30 %** (both ports identical) |
| Total efficiency @ 2.44, per port | 2.77 % |
| Differential mismatch loss | **1.17 dB** (vs flat design's 0.56 dB) |
| Footprint (STL bbox) | 22.4 × 18.5 mm |
| Channel z envelope | −1.137 … (wells to +1.5) mm |

Caveat on precision: the spread across the five radii is only ~0.7 dB and is
**non-monotonic** (7.7 came out worse than 7.9), which is at the level of this
project's documented ±1.5 % mesh/solver uncertainty. So treat the optimum as
"serp_R ≈ 7.5 mm giving ≈ −6 dB", not as a sharply-determined value. Chasing
0.1 dB further would not be physically meaningful.

Note on per-port total efficiency: CST's 2.77 % is for single-port excitation with
the other port terminated, which is **not** the differential drive condition. For a
differential drive the meaningful estimate is
`rad_eff x (1 - |Sdd11|^2)` = 5.30 % x 0.764 ≈ **4.05 %** — comparable to the flat
design's ~5.8 %. Quote the derived figure, labelled as derived.

### A results-reading bug worth knowing about

`scan_feed_match.py` originally picked results by `max(run_id)`, assuming the
highest id is the newest solve. **CST puts the current parameter set in run_id 0**
and pushes stored parameter combinations to higher ids, so max-id can be an OLDER
run. This surfaced when a re-solve at serp_R 7.5 returned the previous 7.4 point's
impedance byte-for-byte.

`work/audit_runs.py` pairs every run id with its own parameter combination and its
own Sdd11; running it confirmed **all scan points in the table above are correctly
attributed** (only the final confirmation read had been stale), and that runs 0 and
6 — the same design point solved twice — agree exactly, which is also a useful
reproducibility check. Both readers now select by matching parameters / preferring
run 0. Use `audit_runs.py` whenever a number looks suspiciously familiar.

### Exported CAD (in `deliverables/`)

| File | What it is |
|---|---|
| `zwave-channel-master.stl` | **the channel volume** — print as the raised positive on the resin master. NOT a dissolvable core (that label is out of date, DESIGN-EVOLUTION §7) |
| `zwave-substrate.stl` | the 3.0 mm slab — the cast envelope |
| `zwave-antenna.step` | full assembly for CAD work |

Phantom, pins, and coax shields are stripped — those are simulation constructs or
bought parts (the SSMA connector), not printed. Verified: only `Substrate` and
`ChannelSolid` remain, and the STL bounding box bottom at −1.137 mm confirms the
out-of-plane undulation really is in the exported geometry (a flat channel would
bottom out at −0.25 mm).

**Fabrication caveat, unchanged and still open:** this master is *not* a planar
groove. It is castable in principle because the process is a 3D-printed resin
master with a flexible elastomer cast (the part flexes on demould), but whether a
Ø0.5 mm channel undulating ±0.886 mm releases cleanly is **unconfirmed on a real
print**. Crest curvature radius at this design point is ~0.48 mm against a 0.25 mm
tube radius — above the self-intersection limit, but not by a large margin.

## 4. Honest framing for the report

- Quote the **mismatch loss**, not the raw dB: −6.3 dB Sdd11 = 1.17 dB mismatch
  loss vs the flat design's 0.56 dB. **The z-wave costs ~0.6 dB of delivered
  power.** Against ~31 dB of link margin this does not threaten viability. Saying
  "−6 dB vs −9 dB" makes it sound far worse than it is.
- Do **not** claim the z-wave feed matches the flat design's match quality. It
  doesn't, and the reason is physical, not a tuning failure.
- The efficiency figures are read at 2.44 GHz, which for this design **is** the
  operating point (the match is tuned there); the series resonance sits lower at
  ~2.2 GHz by design, exactly as in the flat design. This is not the
  "efficiency read off-resonance" error — but it is worth stating explicitly,
  since the operating point and the series resonance are deliberately different.
- **The full cost of the z-wave** is now three items, not one: a non-planar
  channel to cast, a thicker substrate (3.0 mm vs 1.95 mm), and ~0.6 dB of extra
  mismatch loss — bought for roughly halving the strain drift. That is the trade
  to present.

---

## 7. Methodology correction: rank on DELIVERED power, not on match (2026-07-27)

**Everything in §2–§3 above was ranked on |Sdd11| alone. That is wrong once the
loop is driven past anti-resonance, and it changes which design you pick.**

`work/audit_efficiency.py` pairs each solved run with its own radiation efficiency
and computes the figure that actually matters:

```
delivered = rad_eff x (1 - |Sdd11|^2)
```

| serp_R | sub_h | Sdd11 | rad eff | delivered |
|---|---|---|---|---|
| 7.90 | 3.000 | −6.47 | 5.29 % | 4.10 % |
| 8.10 | 3.000 | −6.89 | 5.28 % | 4.20 % |
| **8.30** | 3.000 | −7.22 | 5.25 % | **4.25 %** ← best delivered |
| 8.50 | 3.000 | **−7.34** ← best match | 5.19 % | 4.23 % |
| 8.70 | 3.000 | −7.26 | 5.11 % | 4.15 % |
| 8.90 | 3.000 | −7.01 | 5.01 % | 4.01 % |
| 7.90 | 6.366 | −5.08 | 5.50 % | 3.79 % |
| **8.50** | 6.508 | −6.22 | 5.22 % | **3.97 %** |
| 9.10 | 6.650 | **−6.71** ← best match | 4.72 % | **3.72 %** ← WORST delivered |

The serp_R = 9.1 row is the whole point. It has the best match of the thick-slab
family and the worst delivered power, because radiation efficiency collapses
(5.50 → 4.72 %) as the loop is pushed past anti-resonance onto a higher-order
mode. **A better match on a degrading mode.** Chasing |Sdd11| outward would have
selected it.

Note also that radiation efficiency *rises* with substrate thickness at fixed
radius (5.29 → 5.50 % at serp_R 7.9, sub_h 3.0 → 6.37): a thicker slab holds the
loop further from the tissue, so less power is absorbed. That partly cancels the
match penalty, which is why the thick slab is much cheaper than the match figures
alone suggest.

### Consequences

- **The 2 mm cover costs ~0.30 dB of delivered power**, not the 1.1–1.4 dB the
  match numbers implied (4.25 % → 3.97 %). Effectively free against a ~31 dB link
  margin.
- **Optimum for the buildable 2 mm-cover family: serp_R ≈ 8.5 mm, sub_h ≈ 6.51 mm**
  → Sdd11 −6.22 dB, rad 5.22 %, delivered 3.97 %.
- Optimum at sub_h = 3.0 is serp_R ≈ 8.3 (delivered 4.25 %), *not* 8.5 as the
  match ranking said — though the two are 0.02 pp apart, i.e. a plateau, well
  inside mesh noise.
- **The anti-resonance turnover is real and confirmed**: at sub_h 3.0, Im(Zdiff)
  crosses zero between serp_R 8.7 (+38 Ω) and 8.9 (−44 Ω). So "does an optimum
  exist" is answered by the closed impedance locus, not by where a scan stopped.

### A trap worth adding to the list: identical parameters ≠ identical model (2026-07-29)

`work/zwave-feed2.cst` and `work/zwave-feed3.cst` have **byte-identical parameter
sets** — all 40 of them, `serp_R` 7.7, `sub_h` 3.0, `z_amp` 0.9095, everything.
They give **different answers**: Sdd11 @ 2.44 of −7.09 dB vs −5.98 dB, with
|Sdd11| minima 0.7 GHz apart (2.476 vs 3.181).

The difference is in the **model history**, not the parameters. Diffing
`Model/3D/Model.mod`:

- feed2 has **no 3-point stub** — it lacks the `sc1`/`sc2` radial scaling that
  pulls the stub out to `outer_r` at `z = zamp`, so the stub is a single straight
  line that does not lie in the land plane.
- feed2's wells are `.Zrange "land_z - chan_r", "sub_h/2"` → **0.66 mm deep**;
  feed3's are `.Zrange "-z_amp", "sub_h/2"` → **2.41 mm deep**.

Those are exactly the two fabrication fixes applied afterwards, and they move the
match by ~1 dB. **feed3 is the built design**: its `Model.mod` is byte-identical
(md5 `86a25313…`) to `work/zwfinal-fab.cst`, the project the STEP and the mould
plates were exported from.

> **Rule: to prove two CST projects are the same antenna, compare
> `Model/3D/Model.mod`, not the parameter list.** A parameter sweep only varies
> what the history exposes; everything else about the geometry is invisible to it.

This cost a mislabelled figure: `sdd11-flat-vs-zwave.png` was first plotted from
feed2 and captioned as the design's match.

### CST stores no VSWR result item

There is no `1D Results\VSWR\...` entry — CST renders VSWR on demand in the GUI
from the S-parameters. An export script that walks the result tree therefore
*cannot* produce one, and an earlier export shipped three `*-VSWR.png` files that
were byte-identical copies of the corresponding `*-S11.png`. Compute it instead,
and compute the **differential** one, since single-ended VSWR is as misleading
here as single-ended S11:

```
VSWR_dd = (1 + |Sdd11|) / (1 - |Sdd11|)
```

At 2.44 GHz: **flat 2.07, z-wave 2.91**. `scripts/plot_sdd11_compare.py` emits it.

### Still to do before any of this is quoted

The **−6.7 % strain drift was measured at sub_h = 4.0** and must NOT be carried
over to a ~6.5 mm slab unverified. Under stretch the slab thins by lam_t, pulling
the channel toward the skin, and that standoff change scales with sub_h (2.50 →
2.37 mm at sub_h 3.0, but 4.25 → 3.97 mm at 6.5). Body loading sets part of the
resonance, so the drift figure can move. It is the project's headline claim, so
re-run the 5-point sweep at the final geometry.
