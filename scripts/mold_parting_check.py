#!/usr/bin/env python3
"""Can a FLAT parting plane mould the z-wave channel? (No -- and here is the proof.)

A groove can only be cast if the parting surface CUTS the channel along its whole
length: the plane must pass within one channel radius of the centreline
everywhere. Where the centreline strays further than chan_r from the plane, the
channel is wholly on one side -- fully enclosed inside that mould half, with no
opening at the parting surface. In a rigid mould half that region becomes a
floating fully-enclosed island: unmouldable, and it also breaks the boolean.

This sweeps every candidate flat plane height and reports the fraction of the loop
that stays cuttable, then does the same for a parting surface that FOLLOWS the
channel (the "half-donut face" idea).
"""

from __future__ import annotations

import math

# Final design point (work/ZWAVE-FEED-FINDINGS.md §3)
R, AMP_RATIO, SERP_RATIO, N = 7.5, 0.2, 0.05, 12
Z_AMP, Z_CYC, CHAN_R, SUB_H = 0.8859, 24, 0.25, 3.0
GAP = 1.0
M = 20000


def path():
    Am, Sk = R * AMP_RATIO, R * SERP_RATIO
    s0 = R + Am + 2 * Sk * N
    dg = min(GAP / s0, 0.6)
    tA, tB = dg / 2, 2 * math.pi - dg / 2
    pts = []
    for i in range(M + 1):
        t = tA + (tB - tA) * i / M
        uu = R + Am * math.sin(N * t + math.pi / 2)
        vv = Sk * math.sin(2 * N * t + math.pi)
        ct, st = math.cos(t), math.sin(t)
        pts.append((uu * ct + vv * st, uu * st - vv * ct,
                    Z_AMP * math.cos(Z_CYC * t)))
    return pts


P = path()
zs = [p[2] for p in P]
print(f"channel centreline z range: {min(zs):+.4f} .. {max(zs):+.4f} mm")
print(f"channel radius            : {CHAN_R} mm")
print(f"=> a flat plane at height h cuts the channel only where |z(t) - h| < "
      f"{CHAN_R}\n")

print(f"{'plane z=h':>10} {'cuttable %':>11} {'fully ABOVE %':>14} "
      f"{'fully BELOW %':>14}")
best = None
for k in range(-20, 21):
    h = k * 0.1
    cut = sum(1 for z in zs if abs(z - h) < CHAN_R)
    above = sum(1 for z in zs if z - h >= CHAN_R)
    below = sum(1 for z in zs if h - z >= CHAN_R)
    n = len(zs)
    if best is None or cut > best[1]:
        best = (h, cut)
    if k % 2 == 0:
        print(f"{h:10.2f} {100*cut/n:11.1f} {100*above/n:14.1f} "
              f"{100*below/n:14.1f}")

print(f"\nBEST flat plane: z = {best[0]:.2f} mm, cuts only "
      f"{100*best[1]/len(zs):.1f} % of the loop")
print("=> a flat parting plane CANNOT mould this channel. The remaining "
      f"{100-100*best[1]/len(zs):.1f} % is")
print("   fully enclosed in one half -> floating island, no draw direction.")

print("\n" + "=" * 68)
print("Parting surface that FOLLOWS the channel (the half-donut face)")
print("=" * 68)
print("If the parting surface is z = z(t) along the channel, it cuts the")
print("channel by construction, everywhere: 100 %. Each half then carries a")
print("half-round groove and can be drawn straight off.")

# How much does that surface have to undulate, and how steep does it get?
dz = []
for i in range(1, len(P)):
    dx = math.dist(P[i][:2], P[i - 1][:2])
    if dx > 1e-9:
        dz.append(abs(P[i][2] - P[i - 1][2]) / dx)
print(f"\n  surface peak-to-peak undulation : {max(zs)-min(zs):.3f} mm")
print(f"  max surface slope               : {max(dz):.2f} "
      f"({math.degrees(math.atan(max(dz))):.1f} deg from horizontal)")
print(f"  slope > 45 deg over             : "
      f"{100*sum(1 for s in dz if s > 1)/len(dz):.1f} % of the path")
print("  (steep flanks are the demould risk: the elastomer must stretch over")
print("   them, and an undercut appears wherever the surface overhangs)")

print("\n" + "=" * 68)
print("Does the channel lie on a TORUS? (is 'half-donut' literally true?)")
print("=" * 68)
Am = R * AMP_RATIO
rho = [math.hypot(p[0], p[1]) for p in P]
# torus test: (rho - R0)^2/(a^2) + z^2/(b^2) = 1 would be constant
vals = [((r - R) / Am) ** 2 + (p[2] / Z_AMP) ** 2 for r, p in zip(rho, P)]
print(f"  ((rho-R)/Am)^2 + (z/z_amp)^2  ranges {min(vals):.3f} .. {max(vals):.3f}")
print("  (constant = 1.0 would mean the channel lies exactly on a torus)")
print(f"  -> NOT a torus, because z_cyc ({Z_CYC}) != serp_n ({N}).")
print()
print("  For the channel to lie on a torus it needs the SAME spatial frequency")
print("  as the in-plane meander, in QUADRATURE:")
print(f"       z = z_amp * sin(serp_n * t)      with z_cyc = serp_n = {N}")
print("  Then (rho-R)/Am and z/z_amp are cos/sin of the same angle, so the")
print("  centreline is a closed toroidal coil on an elliptical torus of")
print(f"  major radius {R} mm and semi-axes Am={Am:.2f} mm (radial) x z_amp (axial).")
z12 = 0.118117 * R * (Z_CYC / N)      # a/lambda_z is per-cycle, so x2 at half cycles
print(f"\n  strain-optimal z_amp at z_cyc={N}: {z12:.3f} mm")
print(f"  channel envelope then           : {2*(z12+CHAN_R):.3f} mm")
print(f"  substrate needed (0.36 mm cover): {2*(z12+CHAN_R)+0.73:.2f} mm"
      f"   [budget 6.0 mm]")
