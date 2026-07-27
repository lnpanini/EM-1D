# Z-Wave Strain Result — Findings (2026-07-26)

**Verdict: the z-wave is strain-TOLERANT, not strain-INVARIANT.** Full-wave CST
shows the re-tuned z-wave drifting **−6.7 % at 20 % strain** — not the ~0.1 % the
analytical model promised, but meaningfully better than a flat loop on the same
substrate (**−11.5 %**). The out-of-plane undulation roughly **halves** the drift.
It does not, and cannot, eliminate it: resonance tracks the loop's in-plane path,
which grows ~6 % under 20 % stretch and sets a hard floor no conductor shape beats.

Established carefully and reproducibly, with a controlled same-substrate baseline.

---

## 1. What was done, in order

1. **Re-tuned `serp_R`** on the z-wave model to 2.44 GHz. Coupled
   `z_amp = 0.1181·serp_R` so the design stays on its arc-length optimum through
   the tune (the handoff's fixed `z_amp` and its `a/λ_z ≈ 0.183` were both off —
   see §5). Converged in 3 solves to **serp_R = 7.662 mm, z_amp = 0.905 mm →
   2.450 GHz, −31.7 dB**, −10 dB BW 11.8 %, radiation efficiency 5.5 % at
   resonance (on-body). The tune is clean and the model is sound.

2. **Ran the 5-point strain sweep** (0/5/10/15/20 %) on the tuned model.

3. **Ran a controlled flat baseline** — the same macro with `z_amp = 0`, same
   `serp_R` and 4 mm substrate — to isolate the z-wave's actual contribution.

## 2. The numbers (on-body, CST, identical 4 mm substrate)

| strain | flat `z_amp=0` | z-wave | in-plane floor* |
|---|---|---|---|
| 0 %  | 3.040 GHz (—)      | 2.450 GHz (—)      | — |
| 5 %  | 2.968 (−2.37 %)    | 2.408 (−1.71 %)    | −1.42 % |
| 10 % | 2.884 (−5.13 %)    | 2.368 (−3.35 %)    | −2.80 % |
| 15 % | 2.812 (−7.50 %)    | 2.328 (−4.98 %)    | −4.25 % |
| 20 % | 2.690 (**−11.51 %**) | 2.286 (**−6.69 %**) | −5.66 % |

\* *in-plane floor = drift if resonance ∝ 1/(in-plane path length); the in-plane
path grows +6.0 % at 20 % strain regardless of the out-of-plane shape.*

Figure: `deliverables/strain-zwave-vs-flat.png`. The z-wave curve hugs the
in-plane floor; the flat curve drifts ~2× worse.

> ⚠️ The auto-reader first reported a bogus 0 % z-wave point (2.126 GHz): the
> project still held pre-tune solves as extra run IDs and the de-dup grabbed a
> stale one. Fixed (filter runs by `serp_R`); the z-wave numbers are run IDs 5–9,
> all at `serp_R = 7.6621`.

## 3. Why — the mechanism

The analytical premise was **resonance ∝ 3D arc length**. Under it the z-wave is
perfect: as the elastomer thins in z under stretch (incompressible, ν≈0.5), the
z-wave flattens and the 3D arc length is preserved (137.0 → 137.0 mm at 20 %). The
math is right — it just tracks the wrong quantity.

**Full-wave CST resonance tracks the IN-PLANE path length, not the 3D arc
length.** Evidence:

- **Fixed-radius diagnostic.** Flat (`z_amp=0`) at the same `serp_R`/substrate
  resonates at **3.04 GHz**; the z-wave at **2.45 GHz** — so the undulation *does*
  add electrical length (a fixed **×0.806** miniaturization), it is not invisible.
- **`f · L_in-plane` is invariant under strain for the z-wave:** 2.450 × 102.1 =
  250.1 at 0 %, 2.286 × 108.2 = 247.4 at 20 % — constant to 1 %.

So the drift decomposes as **in-plane path growth + a full-wave "excess"**
(in-plane cross-section thinning, ε_eff shift, ellipticity):

- **Flat**: −11.5 % = −5.7 % (path) + **−5.8 % excess**. The thick 4 mm substrate
  makes the excess large.
- **z-wave**: −6.7 % = −5.7 % (path) + **~−1 % excess**. The z-wave *suppresses*
  the excess — plausibly because lifting the conductor through the substrate
  spreads its fields over the thickness, so resonance is far less sensitive to
  in-plane cross-section/ε_eff changes — and lands right on the in-plane floor.

**The z-wave removes the full-wave excess sensitivity but not the in-plane
path-growth floor.** That floor is irreducible for a conductor that deforms
affinely with the elastomer — the same root cause behind §2c of DESIGN-EVOLUTION
("the in-plane serpentine provides zero strain relief"). The liquid metal has no
stiffness, so the loop's in-plane footprint stretches with the body no matter what
shape the trace takes, in plane or out.

## 4. Why a different z_cyc / z_amp will not reach invariance

The floor is set by in-plane path growth (~−5.7 % at 20 %), which is independent
of the out-of-plane geometry. A bigger or lower-frequency z-wave can only change
the at-rest miniaturization factor and (perhaps) shave the residual excess — it
cannot push drift below the floor. So no z-wave variant reaches the ~0.1 % target.
(Did not spend solver time on a z_cyc=12 sweep for this reason; the mechanism
bounds it.) A quick z_cyc=12 sweep could still be run if a definitive "we tried"
data point is wanted for the report.

## 5. Corrections to the handoff numbers (for the record)

- `a/λ_z ≈ 0.183` does **not** null the arc-length drift; the true optimum for
  z_cyc=24 is **≈ 0.213**. At the handoff's `z_amp = 0.923` the arc-length model
  predicts −0.87 % at 20 %, not 0.11 %. (DESIGN-EVOLUTION §6 already flagged 0.183
  as unvalidated — this is that validation returning negative.) *Moot regardless*,
  since the arc-length model itself is refuted by full-wave.
- `z_amp` should be **coupled** to `serp_R`, not fixed, or the frequency tune
  walks the design off its own optimum. Applied here.
- The arc-length model's prediction (+0.006 %) vs full-wave (−6.7 %) is not a
  numerical error — it is the modelling assumption that is wrong.

## 6. Recommendation

The z-wave is a **real but partial** win, at a real fabrication cost. The decision
is a genuine trade, and it is the user's/team's to make:

- **As strain compensation, drop the "invariant" claim.** The honest headline is
  "the out-of-plane undulation ~halves frequency drift under stretch (−11.5 % →
  −6.7 % at 20 %) but cannot beat the in-plane path-growth floor." Present it as
  **strain-tolerant**, alongside the existing tolerance-by-bandwidth story (BLE
  covered to ~10 % strain), not as strain-invariant.
- **It is also a miniaturization aid** (×0.8 on frequency ⇒ smaller footprint),
  independent of the strain question.
- **Weigh against fabrication.** The z-wave needs a 4 mm non-planar channel vs the
  flat design's ~1.95 mm planar one. Halving the drift (≈10 % → maybe ~12–13 % BLE
  strain tolerance) may or may not justify that; that is the call to make before
  building the feed + STL (tasks held).
- **Physics takeaway for the report** (a clean, defensible result): *for an
  affinely-deforming liquid-metal loop, no trace geometry — in-plane or
  out-of-plane — makes resonance strain-invariant.* True invariance would need a
  stiffness contrast (so the conductor unfolds instead of stretching), a
  strain-decoupling substrate, or an adaptive match — not a trace shape.

---

## 8. RE-VERIFIED at the final 6.5 mm geometry (2026-07-27) — the claim weakened

The −6.7 % / −11.5 % pair in this document was measured at `sub_h` 3.0–4.0 mm. The
final design uses **`sub_h` = 6.508 mm** (2 mm cover, a fabrication requirement),
where the channel-to-skin standoff changes about twice as much under stretch. Both
legs were therefore re-run at matched geometry, `serp_R` 8.5 / `sub_h` 6.508
(`work/run_strain_at.py`, projects `zwstrain85.cst` and `zwflatB.cst`):

| strain | flat control f0 | drift | z-wave f0 | drift |
|---|---|---|---|---|
| 0 % | 2.620 GHz | — | 2.174 GHz | — |
| 5 % | 2.560 | −2.29 % | 2.140 | −1.56 % |
| 10 % | 2.460 | −6.11 % | 2.070 | −4.78 % |
| 15 % | 2.404 | −8.24 % | 2.040 | −6.16 % |
| **20 %** | **2.348** | **−10.38 %** | **2.004** | **−7.82 %** |

### The headline must be restated

| geometry | flat | z-wave | z-wave benefit |
|---|---|---|---|
| serp_R 7.662, sub_h 3.0 | −11.51 % | −6.69 % | **1.72×** (42 % reduction) |
| **serp_R 8.5, sub_h 6.508 (final)** | **−10.38 %** | **−7.82 %** | **1.33×** (25 % reduction) |

**"Halves the drift" is NOT true at the geometry being built.** It is a **25 %
reduction**. Do not quote the 42 % / 1.72× figure for this design.

Note the *absolute* benefit shrank too, 4.82 → 2.56 percentage points, so this is
not merely a common additive drift term from the body-standoff effect diluting a
ratio — the mechanism itself delivers less on the thicker slab.

**Attribution caveat:** `serp_R` moved (7.662 → 8.5) as well as `sub_h`
(3.0 → 6.508), so the two rows differ in two variables. Each row is internally
matched (same serp_R and sub_h for its flat and z-wave legs), so each ratio is
sound, but the *change* between rows cannot be attributed to thickness alone. An
isolated thickness study would need z-wave + flat at serp_R 8.5, sub_h 3.0.

**So the cost of the 2 mm cover is now known on both axes:**
- differential match / delivered power: **0.30 dB** — essentially free
- strain drift: **−6.7 % → −7.82 %**, and the advantage over flat falls from
  1.72× to 1.33× — *not* free, and this is the project's headline claim

If the strain result matters more than the 2 mm cover, the lever is `z_cyc = 36`:
it holds a full 2 mm cover inside a 5.84 mm slab (`z_amp ∝ 1/z_cyc`), which should
recover part of the lost advantage. That needs a re-tune and another sweep pair.
