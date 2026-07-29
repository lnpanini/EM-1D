#!/usr/bin/env python3
"""How much of the measured-vs-simulated gap can each hypothesis actually explain?

Two measurements of the same prototype, same day:
    19018.set     06:33  f0 = 2.5134 GHz at -16.50 dB   <- BEST, use this one
    harish003.set 13:25  f0 = 2.6400 GHz at -10.28 dB   <- after degradation
Simulated (zwfree.cst, free space, single-ended): f0 = 2.114 GHz.

Compare against the BEST trace: a degraded device is not the thing the model is
trying to predict. The real device resonates HIGH by 399 MHz (+18.9 %).

For a loop, f ~ 1 / (L_elec * sqrt(eps_eff)). So resonating HIGH means the real
device has a SHORTER electrical path, a LOWER effective permittivity, or both.
Each hypothesis below is converted into the frequency ratio it would produce, so
they can be ranked instead of merely listed.

Key input from scripts/path_length_report.py:
    in-plane path   123.34 mm
    3D path         164.25 mm
    out-of-plane excess 40.92 mm
and from the flat-vs-z-wave pair, only alpha = 0.62 of the out-of-plane length is
electrically realised.
"""

from __future__ import annotations

F_SIM, F_MEAS = 2.114, 2.5134      # sim free space vs BEST measurement
F_DEGRADED = 2.640                  # same prototype, 7 h later
L_IN, L_3D = 123.34, 164.25
ALPHA = 0.62
EXCESS = L_3D - L_IN

need = F_MEAS / F_SIM
print(f"measured / simulated = {F_MEAS}/{F_SIM} = {need:.3f}  "
      f"({100*(need-1):+.1f} %)")
print(f"=> the real device's L*sqrt(eps_eff) is {100/need:.1f} % of the model's\n")

L_model = L_IN + ALPHA * EXCESS
print(f"modelled electrical length  = {L_IN:.2f} + {ALPHA}x{EXCESS:.2f} "
      f"= {L_model:.2f} mm\n")

print(f"{'hypothesis':<52} {'f ratio':>8} {'f0 pred':>9} {'% of gap':>9}")
print("-" * 82)

rows = []


def add(name, ratio):
    f0 = F_SIM * ratio
    share = 100 * (f0 - F_SIM) / (F_MEAS - F_SIM)
    rows.append((name, ratio, f0, share))
    print(f"{name:<52} {ratio:8.3f} {f0:9.3f} {share:8.0f} %")


# 1. z-wave electrically absent: EGaIn took the flat, shortest path
add("z-wave not realised (air trapped at crests)", L_model / L_IN)

# 2. partial fill shortening the conductor
for frac in (0.95, 0.90, 0.85):
    add(f"conductor {int(frac*100)} % filled (rest air void)", 1 / frac)

# 3. eps_eff lower than modelled. Free-space eps_eff is already near 1, and
#    eps_eff < 1 is impossible, so this term is BOUNDED.
for e_model in (1.25, 1.15):
    add(f"eps_eff {e_model} -> 1.00 (physical floor)", (e_model / 1.00) ** 0.5)

# 4. geometry cast smaller than drawn
for shrink in (0.97, 0.95):
    add(f"part cast {100*(1-shrink):.0f} % undersize (linear)", 1 / shrink)

print("-" * 82)
combo = (L_model / L_IN) * (1.15 / 1.00) ** 0.5
print(f"{'z-wave absent + eps_eff 1.15->1.00':<52} {combo:8.3f} "
      f"{F_SIM*combo:9.3f} {100*(F_SIM*combo-F_SIM)/(F_MEAS-F_SIM):8.0f} %")

print(f"\nDEGRADATION over 7 h: f0 {F_MEAS:.4f} -> {F_DEGRADED:.4f} GHz "
      f"({1000*(F_DEGRADED-F_MEAS):+.0f} MHz), match -16.50 -> -10.28 dB,")
print("-10 dB bandwidth 680 -> 24 MHz. The DIRECTION is the tell: frequency rose")
print("AND the match worsened, which is what losing conductor path does -- the")
print("same mechanism as the primary hypothesis, still in progress.")
extra = F_DEGRADED / F_MEAS
print(f"That further shift needs L*sqrt(eps) down another "
      f"{100*(1-1/extra):.1f} %, i.e. ~{L_model*(1-1/extra):.1f} mm of "
      f"electrical length lost between the two sweeps.")

print("\nNOTE on eps_eff: it cannot go below 1, so permittivity error alone can")
print(f"explain at most {100*((1.25**0.5)-1)/(need-1):.0f} % of the gap even if the")
print("model's eps_eff were as high as 1.25. It is a contributor, never the cause.")
