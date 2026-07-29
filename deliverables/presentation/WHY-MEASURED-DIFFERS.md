# Why the measurement doesn't match the simulation — candidate explanations, ranked

Reproduce with `python scripts/explain_meas_gap.py`.

**The fact to explain.** Measured (`harish003.set`, free space, single-ended)
f₀ = **2.640 GHz**. Simulated (`zwfree.cst`, free space, single-ended)
f₀ = **2.114 GHz**. The real device resonates **HIGH by 526 MHz (+24.9 %)**, and
its dip is far shallower (−10.3 dB vs −33.4 dB) and broader.

These are two separate things to explain — **the frequency shift** and **the
shallow dip** — and they have different causes. Don't blur them.

---

## Part 1 — why it resonates HIGH

For a loop, *f* ∝ 1 / (L_elec · √ε_eff). Resonating high means a **shorter
electrical path**, a **lower effective permittivity**, or both. The measurement
implies L·√ε_eff is only **80.1 %** of the model's.

| Hypothesis | *f* ratio | predicted f₀ | explains |
|---|---|---|---|
| **Z-wave not electrically realised** | 1.206 | 2.549 GHz | **83 %** |
| Conductor only 85 % filled | 1.176 | 2.487 GHz | 71 % |
| ε_eff 1.25 → 1.00 (physical floor) | 1.118 | 2.364 GHz | 47 % |
| Conductor only 90 % filled | 1.111 | 2.349 GHz | 45 % |
| ε_eff 1.15 → 1.00 | 1.072 | 2.267 GHz | 29 % |
| Conductor 95 % filled | 1.053 | 2.225 GHz | 21 % |
| Part cast 5 % undersize | 1.053 | 2.225 GHz | 21 % |
| Part cast 3 % undersize | 1.031 | 2.179 GHz | 12 % |

### The leading explanation: air trapped at the z-wave crests

**This single mechanism accounts for 83 % of the shift, and it is the failure mode
this geometry was always most likely to have.**

The modelled electrical length is `123.34 mm (in-plane) + 0.62 × 40.92 mm
(out-of-plane, at the measured realisation factor α = 0.62) = 148.70 mm`. If the
EGaIn never followed the crests — bridging straight across instead — the
electrical length collapses to the in-plane **123.34 mm**, a ratio of 1.206, and
predicts **f₀ = 2.549 GHz** against 2.640 measured. The residual 91 MHz (3.5 %) is
comfortably inside the ε_eff and fill terms above.

**Why it is physically likely, not just arithmetically convenient:**

- The channel is **Ø0.5 mm** and undulates **±1.004 mm** — an amplitude four times
  the bore, over 24 cycles. There is no gentle path; the liquid must climb and
  descend 48 times.
- **EGaIn has the highest surface tension of any room-temperature liquid metal**
  (~624 mN/m, roughly 7× water) and does not wet most polymers. Under capillary
  filling it will preferentially **bridge a crest rather than follow it**, leaving
  a trapped air pocket at each peak.
- The repo already flags this as the open fabrication risk: whether a Ø0.5 mm
  channel undulating ±1 mm fills and releases cleanly was **never confirmed on a
  real print** (`docs/ZWAVE-FEED-FINDINGS.md`).

**This is a testable claim, and worth saying you'd test it:** back-light the cast
part, or weigh the injected EGaIn against the channel volume
(`π·0.25²·164.25 ≈ 32.3 mm³`, ≈ **0.20 g** at 6.25 g/cm³). If the mass is short by
~25 %, the crests are empty and this is confirmed.

### What can be ruled out or bounded

**ε_r error alone cannot do it.** ε_eff cannot go below 1. Even taking the model's
free-space ε_eff at a generous 1.25, driving it to the physical floor buys only
**47 %** of the shift. Ecoflex permittivity error is a real contributor — and the
value is uncited (§2 of the README) — but it is arithmetically incapable of being
the whole story.

**Dimensional shrinkage is too small.** Silicone cure shrinkage is typically
< 1–2 % linear; even 5 % explains only 21 %.

---

## Part 2 — why the dip is shallow and broad (−10.3 dB, not −33 dB)

A different question, and mostly a **measurement-topology** one.

1. **The antenna is balanced; the measurement is not.** This is a one-port reading
   of one SMA. The coax outer conductor becomes part of the radiator, so what was
   measured is partly a common-mode structure, not the differential antenna. You
   have already demonstrated this directly: **metal contact near the coax moved f₀
   by 381 MHz** — a sensitivity of the same order as the entire disagreement.
2. **What terminated port 2?** The simulation assumes the second port sees 50 Ω. If
   the second SSMA was left **open or shorted** during the sweep, the boundary
   condition differs from the model and both depth and frequency move. Worth
   checking your bench notes — it is the cheapest thing on this list to resolve.
3. **The real conductor is lossier than modelled.** A damped resonator gives a
   shallow, broad dip. EGaIn grows a thin gallium-oxide skin on contact with air,
   and the SSMA-pin-to-EGaIn well junction is a mechanical contact, not a soldered
   one. Partial fill also necks the conductor, raising series resistance.
4. **The calibration plane is not the antenna plane.** Calibration was to the cable
   end; the SSMA-to-well transition is not de-embedded, so its series inductance is
   included in the measurement but not in the port model.

---

## How to say this in one slide

> Measured f₀ is 526 MHz above simulation. The dominant candidate is **incomplete
> filling of the out-of-plane crests**: EGaIn's very high surface tension makes it
> bridge a Ø0.5 mm channel undulating ±1 mm rather than follow it. Losing the
> out-of-plane path entirely shortens the electrical length from 148.7 mm to
> 123.3 mm and predicts 2.549 GHz — 83 % of the observed shift. The remainder is
> consistent with Ecoflex ε_r uncertainty, which alone cannot explain more than
> half. The shallow dip is separately explained by a one-port measurement of a
> balanced antenna, where the cable is demonstrably part of the radiator.

**The honest framing:** if the crests are empty, the fabricated part is
electrically the *flat* design, and the strain-tolerance claim is untested in
hardware. That is a real result about **manufacturability**, not a failure of the
electromagnetics — and it points straight at the mould process as the thing to fix.
