# Z-Wave Casting Mould — Notes (2026-07-27)

**Architecture: two flat plates, one with a CONCAVE ring, one with a CONVEX ring,
each carrying the same Ø0.5 mm half-round channel ridge. No sacrificial core.**

This supersedes the first attempt (open cavity + dissolvable core), which was
built before we established that the meander rests on a concave ring.

---

## 1. The key geometric fact

The channel centreline lies on a **parabolic concave ring** ("gutter"), verified
to **19.4 µm** (7.8 % of the channel radius) by `work/gutter_check.py`:

```
z = f(u) = (2·z_amp/A²)·u² − z_amp        u = ρ − serp_R,  |u| ≤ A
```

The out-of-plane undulation is therefore **not** an independently-designed 3D
curve — it is what you get when a *planar radial meander* rides a curved surface.
That also explains, and forces, `z_cyc = 2·serp_n`: for any **even** (symmetric)
gutter profile, `u = A·cos(n·t)` gives lowest harmonic `cos(2n·t)`. Our design has
`z_cyc = 24 = 2 × 12`, so it is already exactly consistent.

**Consequence:** the gutter surface *is* the parting surface, and it cuts the
channel along the entire loop — 100 %, versus at most 33 % for any flat plane
(`work/mold_parting_check.py`). So no core is needed.

> Also settled: this rules out `ZWAVE-HANDOFF.md`'s "preferred" option — "wave
> offset entirely above the bond plane, one patterned half + flat cap". A groove
> must be open along its *whole* length; offsetting the wave above a flat plane
> buries it. That option cannot work for any non-zero `z_amp`.

## 2. Final design point

> ### ⚠️ SUPERSEDED — see §2b
> The table immediately below is the **shallow-well, 0.34 mm-cover** design and is
> kept only for the tuning history. Two later changes moved it: the well was
> deepened to 2.41 mm, and cover was raised to 2.0 mm on fabrication grounds,
> which forces a ~6.5 mm slab. **Build from §2b.**

Re-tuned **after** moving the feed into the land plane (§3):

| | value |
|---|---|
| `serp_R` | **7.7 mm** |
| `z_amp` = 0.1181·`serp_R` | **0.9095 mm** |
| `z_cyc` | 24 (= 2·`serp_n`) |
| `sub_h` | 3.0 mm |
| Sdd11 @ 2.44 GHz | **−7.09 dB** (worst in BLE −7.01) |
| Zdiff @ 2.44 | 55.6 + 58.6j Ω (Im/Re 1.054) |
| differential mismatch loss | **0.94 dB** — only **0.39 dB** worse than the flat design's 0.56 dB |
| radiation efficiency @ 2.44 | **5.41 %** (both ports identical → symmetry exact) |
| total efficiency, per port | 3.01 % |
| total efficiency, differential (derived) | **≈ 4.26 %** = 5.41 % × (1−\|Sdd11\|²) |
| footprint | Ø ~19 mm loop, plate Ø 32.8 mm |

`serp_R` scan at `sub_h` 3.0, land-plane feed: 7.3 → −5.93, 7.5 → −6.32,
**7.7 → −7.09**, 7.9 → −6.07, 8.1 → −6.20. Clear peak at 7.7; past 7.9 the curve
flattens because Re keeps climbing (95 Ω at 8.1) but Im climbs faster (110 Ω) —
the same Q ceiling documented in `ZWAVE-FEED-FINDINGS.md` §2. With the old
descending feed the optimum sat at 7.5/−6.27, so the reposition both improved the
match by 0.8 dB and moved the optimum.

Re-solving the design point reproduced −7.09 dB and 55.6 + 58.6j **exactly**,
which is both a reproducibility check and confirmation that the parameter-matched
result reader is picking the right run.

> Quote the **per-port total efficiency (3.01 %) with care**: CST computes it with
> the other port terminated, which is not the differential drive condition. For a
> differential drive the meaningful figure is the derived 4.26 %. Radiation
> efficiency (5.41 %) is drive-independent and is the safe one to compare against
> the flat design's ~6 %.

## 2b. CURRENT design point — 2 mm cover, deep well  (build from this)

Cover was raised to **2.0 mm** on fabrication grounds (it is the wall that retains
the EGaIn), and the connector wells deepened to 2.41 mm. Cover is now the *fixed*
quantity and `sub_h` follows from it:

    sub_h = 2 * (z_amp + chan_r + cover)

Holding `sub_h` fixed instead — as the earlier scans did — silently thins the cover
as `serp_R` grows (`z_amp = 0.1181*serp_R`), so those scans were sliding along a
fabrication cliff rather than exploring the design space.

| | value |
|---|---|
| `serp_R` | **8.5 mm**  (8.3 is within noise — see below) |
| `z_amp` = 0.1181·`serp_R` | **1.004 mm** |
| `z_cyc` | 24 (= 2·`serp_n`) |
| `sub_h` | **6.508 mm** |
| cover, both faces | **2.000 mm** |
| well | z = −`z_amp` … `sub_h`/2, i.e. **2.41 mm deep** |
| Sdd11 @ 2.44 GHz | −6.22 dB |
| radiation efficiency @ 2.44 | 5.22 % |
| **delivered power** = rad × (1−\|Sdd11\|²) | **3.97 %** |
| ring | centre 8.500, width 3.400, depth 2.008 mm |
| plate radius | 17.36 mm |

Ranked on **delivered power**, not match (`work/audit_efficiency.py`):

| serp_R | sub_h | Sdd11 | rad eff | delivered |
|---|---|---|---|---|
| 7.9 | 6.366 | −5.08 | 5.50 % | 3.79 % |
| 8.1 | 6.413 | −5.47 | 5.43 % | 3.89 % |
| 8.3 | 6.461 | −5.87 | 5.34 % | 3.96 % |
| **8.5** | **6.508** | **−6.22** | **5.22 %** | **3.97 %** |
| 9.1 | 6.650 | −6.71 ← best match | 4.72 % | 3.72 % ← worst |

8.3 and 8.5 are tied to 0.01 pp — a plateau inside mesh noise. Take **8.3** if the
thinner slab (6.461 mm) is worth more than nothing measurable.

**The 2 mm cover costs only 0.30 dB** of delivered power versus the best thin-slab
point (4.25 % at `serp_R` 8.3 / `sub_h` 3.0). Cheap, because a thicker slab *raises*
radiation efficiency (less tissue absorption) which offsets most of the match loss.
On match alone the penalty looks like 1.4 dB; that reading is wrong.

**`sub_h` = 6.51 mm exceeds the 6 mm budget** stated in `ZWAVE-HANDOFF.md`. If that
budget is hard, the lever is `z_cyc`: `a/λ_z` is fixed by the strain optimum so
`z_amp ∝ 1/z_cyc`. `z_cyc = 36` gives `z_amp` 0.669 → `sub_h` 5.84 mm **with a full
2 mm cover**, crest radius still 0.376 mm (1.5 × `chan_r`). `z_cyc = 48` fits more
easily but drops the crest radius to 0.282 mm — the near-self-intersection regime
the handoff already flagged. A `z_cyc` change needs a re-tune and a re-run of the
strain sweep.

> **⚠️ The −6.7 % strain drift has NOT been verified at this geometry.** It was
> measured at `sub_h` = 4.0. Under stretch the slab thins by `lam_t`, pulling the
> channel toward the skin, and that standoff change scales with `sub_h`: 2.50 →
> 2.37 mm at `sub_h` 3.0, but 4.25 → 3.97 mm at 6.5. Body loading sets part of the
> resonance, so the drift can move. It is the project's headline claim — re-run the
> 5-point sweep before quoting it.

### Ring specification (at serp_R = 7.7, superseded — see §2b for the current ring)

| | value |
|---|---|
| centred at radius | 7.700 mm |
| width (2·A) | 3.080 mm |
| depth (2·z_amp) | 1.819 mm |
| profile | z = 0.7674·u² − 0.9095 |
| curvature radius at bottom | 0.652 mm (vs 0.25 mm channel) |
| max wall slope | 67° from horizontal, **monotonic — no undercut** |
| land / parting plane | z = +0.9095 mm |
| cover over the crests | 0.340 mm |

## 3. The feed reposition (done)

Previously the stubs ran from the terminals **down to z = 0**, i.e. they dived
below the parting surface — unmouldable. The land is the gutter **rim**, at
z = +z_amp, so the stubs, wells and pins now all live there:

- stub endpoints raised from `z = 0` to `z = zamp`
- wells now span `land_z − chan_r … sub_h/2` (they still break the top face, which
  is what the SSMA pin dips into)
- `pin_zb` now `land_z − 0.1` so the pin stays wetted in EGaIn

Result: the stubs **rise** 0.19 mm over a 4.87 mm run — a 2.2° ramp entirely
within the land — instead of dropping 0.909 mm through the parting surface.

## 4. Process

1. Print both plates (resin).
2. Cast against the **CONCAVE** plate → the **upper** layer (its underside bulges
   down into the ring; the well is a through-hole to the top face).
3. Cast against the **CONVEX** plate → the **lower** layer, then **flip it**.
4. Bond the two at the ring surface → the two half-round grooves close into a
   full Ø0.5 mm channel.
5. Inject EGaIn through the wells; fit 2× SSMA.

> **Why the flip is legal:** it maps the pattern onto itself only because the
> design is mirror-symmetric about `y = 0` — which is exactly the `Sin`→`Cos`
> change made to rescue the differential feed (`ZWAVE-FEED-FINDINGS.md` §1b). That
> one fix buys both a clean differential mode *and* a two-plate process.

Plate naming is by **what each forms**, not by its own shape, because those are
opposite: `zwave-mould-concave-forms-upper.stl`,
`zwave-mould-convex-forms-lower.stl`.

## 5. Verification done on the output

- ridge height on the channel centreline = **0.2499 mm** (= `chan_r`) on **both**
  plates; **0.0000** off-path, and 0.0000 at t = 0 which is correctly the 1 mm
  feed gap.
- concave plate z-range −0.910 … +1.500 (gutter bottom → well boss at the top
  face); convex plate +0.910 … +2.979 (land → ring crest + ridge). Exact mirror
  images about the land plane, as required.
- Bugs caught while checking, worth not repeating:
  - the convex plate needs the **path mirrored too** (`2·LAND − z`), or every
    distance comes out large and the ridge silently vanishes;
  - the two plates need **different well-boss heights** (through-hole vs blind);
  - the outer land must be sampled as finely as the ring, or the stub ridges get
    smeared into the surface;
  - a flat-fill top view renders the plate as a featureless disc — colour by
    height, or there is nothing to check.

## 6. Open / to decide

- **File size.** Each plate STL is 31 MB (620 640 facets, ~33 µm arc / 43 µm
  radial). `deliverables/` is git-tracked and now 81 MB. The STLs are *derived* —
  `work/build_gutter_mold.py <serp_R> <sub_h>` regenerates them in ~3 min at any
  resolution — so gitignoring them and committing the generator is probably the
  better trade. Your call.
- **Cover is the tightest dimension**: 0.340 mm of elastomer over the channel
  crests, against the flat design's 0.725 mm. This is the wall that must stay
  sealed under stretch. Raising `sub_h` thickens it but raises Q and worsens the
  match (measured: `sub_h` 4.0 → 3.2 → 2.8 moved Im/Re 1.26 → 1.02 → 0.86).
- **Rim crease.** The gutter meets the land with a slope discontinuity at
  u = ±A (67° to flat). Harmless for moulding but a small fillet there would help
  both print quality and release; not modelled.
- **Bonding** — unchanged open question from DESIGN-EVOLUTION §7: plasma bonding
  is a PDMS trick and works poorly on Ecoflex; plan an uncured-silicone interlayer
  or bond while partially cured.
