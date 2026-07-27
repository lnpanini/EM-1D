#!/usr/bin/env python3
"""Why does the z-wave cancel far less drift than the arc-length model promised?

The analytical model preserves 3D ARC LENGTH under strain and therefore predicts
~0 % drift. Full-wave says -7.82 %. This decomposes the gap.

Two separate questions get conflated, so they are separated here:

  (1) Why is z-wave drift -7.82 % and not ~0 %?
  (2) Why did the z-wave's advantage over flat fall from 1.72x to 1.33x when the
      substrate went 3.0 -> 6.508 mm?

Method: the analytical model gives the PATH-LENGTH contribution alone. CST gives
the total. The residual is everything the path model omits -- conductor
cross-section thinning (chan_r scales with lam_t), the loop going elliptical, and
the channel-to-skin standoff shrinking as the slab thins.

It also measures how much of the z-wave's extra arc length is ELECTRICALLY
realised, from the two 0 %-strain resonances at identical serp_R: if the wiggle
were fully realised, f would scale as 1/L_3D; if invisible, as 1/L_in-plane.
"""

from __future__ import annotations

import math
import sys

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
from zwave_analytic import path_length  # noqa: E402

# ---- the two measured geometries -------------------------------------------
CASES = [
    # label,            serp_R,  z_amp,  sub_h,  flat_meas, zwave_meas, f_flat0, f_zw0
    ("sub_h 3.0 (earlier)", 7.662, 0.9050, 3.000, -11.51, -6.69, 3.040, 2.450),
    ("sub_h 6.508 (built)", 8.500, 1.0040, 6.508, -10.38, -7.82, 2.620, 2.174),
]
E = 0.20


def pct(a, b):
    """drift in % for path lengths a (unstrained) -> b (strained), f ~ 1/L."""
    return 100.0 * (a / b - 1.0)


print("=" * 78)
print("STEP 1 — how much of the z-wave's arc length is ELECTRICALLY realised?")
print("=" * 78)
print("At 0 % strain and identical serp_R, compare the flat control against the")
print("z-wave. If the out-of-plane wiggle were fully realised the frequency would")
print("scale as 1/L_3D; if electrically invisible, as 1/L_in-plane.\n")

alphas = []
for lbl, R, za, sh, fm, zm, f_flat, f_zw in CASES:
    Lip = path_length(0.0, 0.0, 24, R=R)      # in-plane only (z_amp = 0)
    L3d = path_length(0.0, za, 24, R=R)       # full 3D arc
    # measured effective length ratio
    ratio = f_flat / f_zw                     # = L_eff(zwave) / L_eff(flat)
    L_eff = Lip * ratio
    alpha = (L_eff - Lip) / (L3d - Lip)
    alphas.append(alpha)
    print(f"  {lbl}")
    print(f"    L_in-plane {Lip:7.2f} mm   L_3D {L3d:7.2f} mm  (+{100*(L3d/Lip-1):.1f} %)")
    print(f"    f_flat {f_flat:.3f} / f_zwave {f_zw:.3f} -> L_eff {L_eff:7.2f} mm")
    print(f"    => alpha = {alpha:.3f}  ({100*alpha:.0f} % of the wiggle is "
          f"electrically realised)\n")

print("=" * 78)
print("STEP 2 — the path-length term alone, vs what CST measured")
print("=" * 78)
print(f"{'geometry':>22} {'design':>7} {'path-only':>11} {'CST':>9} "
      f"{'residual':>10}")
print("-" * 78)
for (lbl, R, za, sh, fm, zm, _f1, _f2), alpha in zip(CASES, alphas):
    Lip0 = path_length(0.0, 0.0, 24, R=R)
    LipE = path_length(E, 0.0, 24, R=R)
    L3d0 = path_length(0.0, za, 24, R=R)
    L3dE = path_length(E, za, 24, R=R)

    # flat: effective length IS the in-plane length
    d_flat_path = pct(Lip0, LipE)
    # z-wave: only a fraction alpha of the out-of-plane excess counts
    Le0 = Lip0 + alpha * (L3d0 - Lip0)
    LeE = LipE + alpha * (L3dE - LipE)
    d_zw_path = pct(Le0, LeE)

    print(f"{lbl:>22} {'flat':>7} {d_flat_path:+10.2f}% {fm:+8.2f}% "
          f"{fm - d_flat_path:+9.2f}%")
    print(f"{'':>22} {'z-wave':>7} {d_zw_path:+10.2f}% {zm:+8.2f}% "
          f"{zm - d_zw_path:+9.2f}%")
    print()

print("=" * 78)
print("STEP 3 — the benefit, split into what the z-wave can and cannot touch")
print("=" * 78)
for (lbl, R, za, sh, fm, zm, _f1, _f2), alpha in zip(CASES, alphas):
    Lip0 = path_length(0.0, 0.0, 24, R=R)
    LipE = path_length(E, 0.0, 24, R=R)
    L3d0 = path_length(0.0, za, 24, R=R)
    L3dE = path_length(E, za, 24, R=R)
    d_flat_path = pct(Lip0, LipE)
    Le0 = Lip0 + alpha * (L3d0 - Lip0)
    LeE = LipE + alpha * (L3dE - LipE)
    d_zw_path = pct(Le0, LeE)

    path_benefit = d_zw_path - d_flat_path        # what the z-wave cancels
    total_benefit = zm - fm                        # what CST shows
    print(f"  {lbl}")
    print(f"    path-length benefit the z-wave can deliver : "
          f"{path_benefit:+.2f} pts")
    print(f"    benefit CST actually shows                 : "
          f"{total_benefit:+.2f} pts")
    print(f"    residual drift, present in BOTH designs    : "
          f"flat {fm - d_flat_path:+.2f} / z-wave {zm - d_zw_path:+.2f} pts")
    print(f"    ratio flat/z-wave                          : {fm/zm:.2f}x\n")

print("=" * 78)
print("READ-OUT")
print("=" * 78)
print("The z-wave can only cancel the PATH-LENGTH term. Everything else the")
print("strain does -- the channel cross-section thinning as chan_r scales with")
print("lam_t, the loop going elliptical, and the slab thinning so the conductor")
print("moves closer to the skin -- is untouched by the out-of-plane geometry and")
print("sets a floor. The arc-length model predicted ~0 % because it modelled ONLY")
print("the term the z-wave happens to fix.")
