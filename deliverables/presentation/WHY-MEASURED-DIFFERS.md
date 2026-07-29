# Why the measurement doesn't match the simulation — candidate explanations, ranked

Reproduce with `python scripts/explain_meas_gap.py`.

**The facts to explain.** There are **two measurements of the same prototype on the
same day**, and they differ from each other as much as either differs from the model:

| | `19018.set` **06:33 — best** | `harish003.set` 13:25 — degraded |
|---|---|---|
| f₀ | **2.5134 GHz** | 2.6400 GHz |
| \|S11\| at f₀ | **−16.50 dB** | −10.28 dB |
| −10 dB band | **2.4467–3.1267 GHz (680 MHz)** | 2.616–2.640 GHz (24 MHz) |
| at 2.450 GHz | −10.30 dB | −9.15 dB |

Simulated (`zwfree.cst`, free space, single-ended) f₀ = **2.114 GHz**.

**Compare against the BEST trace** — a degraded device is not what the model is
trying to predict. On that basis the real device resonates **HIGH by 399 MHz
(+18.9 %)**, and its dip is shallower (−16.5 dB vs −33.4 dB).

The 06:33 trace is the one described in the project brief (2.527 GHz, −16.2 dB,
694 MHz band) — it matches to within the 6.7 MHz sweep resolution.

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
predicts **f₀ = 2.549 GHz** against **2.5134 GHz** measured. **A 36 MHz miss on a
399 MHz gap.**

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


---

## Part 3 — the degradation between the two sweeps corroborates all of this

Over about seven hours the same prototype went **2.5134 → 2.640 GHz (+127 MHz)**,
match **−16.50 → −10.28 dB**, −10 dB bandwidth **680 → 24 MHz**.

**The direction is the tell.** Frequency rose *and* the match worsened *and* the
resonance broadened — together. That is the signature of **losing conductor path**,
not of drift in permittivity or a thermal effect:

- shorter conductor → higher f₀
- thinner / necked / partly-broken conductor → more series resistance → shallower,
  broader dip

Quantitatively the extra shift needs L·√ε to fall a further **4.8 %**, about
**7.1 mm** of electrical length lost between the two sweeps.

**Plausible mechanisms, all the same family:** EGaIn receding from the crests as
it settles or de-wets; gallium-oxide skin growing at the SSMA-pin-to-well contact;
a slow leak or bubble migration in an unsealed channel.

**This makes the primary hypothesis stronger, not weaker.** It is not just that the
crests may never have filled — it is that the device is *visibly continuing to lose
conductor* while sitting on the bench. Both observations point at the same place:
**filling and sealing a Ø0.5 mm channel that undulates ±1 mm is the unsolved
problem**, and it is a fabrication problem, not an electromagnetic one.

**Present the 06:33 trace as the result**, and show the 13:25 trace as evidence of
the failure mode. That is a stronger, more honest story than either one alone.
