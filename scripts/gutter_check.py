#!/usr/bin/env python3
"""Does the meander "rest on a concave ring"? If so, what is the ring's profile?

The claim: the mould is an otherwise-flat plate with a CONCAVE ANNULAR GUTTER, and
the meander pattern simply lies on the gutter's surface. The out-of-plane
undulation is then not a 3D channel at all -- it is a consequence of a planar
radial meander riding a curved surface.

That predicts something checkable. If the gutter cross-section is z = f(u) with
u = rho - R, and the meander's radius is rho - R = A*cos(n*t), then

    z(t) = f(A*cos(n*t))

and for an EVEN profile f the lowest harmonic is cos(2*n*t): the out-of-plane wave
must run at exactly TWICE the in-plane meander frequency. Our design has
z_cyc = 24 = 2 * serp_n = 2 * 12, which is exactly that. So invert it: solve f
from the built geometry and see whether a single-valued profile really fits.

    z = z_amp * cos(2*n*t)  and  cos(2*n*t) = 2*cos^2(n*t) - 1 = 2*(u/A)^2 - 1
    =>  f(u) = z_amp * (2*u^2/A^2 - 1)      <- a PARABOLIC gutter

Verified numerically below against the actual built centreline (which also carries
the tangential skew term, so rho != uu exactly).
"""

from __future__ import annotations

import math

# Final tuned design point
R, AMP_RATIO, SERP_RATIO, N = 7.5, 0.2, 0.05, 12
Z_AMP, Z_CYC, CHAN_R, SUB_H = 0.8859, 24, 0.25, 3.0
GAP = 1.0
M = 40000

Am, Sk = R * AMP_RATIO, R * SERP_RATIO
s0 = R + Am + 2 * Sk * N
dg = min(GAP / s0, 0.6)
tA, tB = dg / 2, 2 * math.pi - dg / 2

print(f"serp_n = {N}, z_cyc = {Z_CYC}  ->  z_cyc / serp_n = {Z_CYC/N:.0f}")
print("(an even gutter profile forces exactly this 2:1 ratio)\n")


def profile(u):
    """Predicted gutter cross-section: parabola through (0,-z_amp),(±A,+z_amp)."""
    return Z_AMP * (2.0 * (u / Am) ** 2 - 1.0)


worst = 0.0
worst_at = None
rows = []
for i in range(M + 1):
    t = tA + (tB - tA) * i / M
    uu = R + Am * math.sin(N * t + math.pi / 2)      # = R + Am*cos(N t)
    vv = Sk * math.sin(2 * N * t + math.pi)
    x = uu * math.cos(t) + vv * math.sin(t)
    y = uu * math.sin(t) - vv * math.cos(t)
    z = Z_AMP * math.cos(Z_CYC * t)
    rho = math.hypot(x, y)
    u = rho - R
    err = abs(z - profile(u))
    if err > worst:
        worst, worst_at = err, (t, u, z, profile(u))
    if i % (M // 12) == 0:
        rows.append((t, u, z, profile(u), err))

print(f"{'t':>7} {'u=rho-R':>9} {'z built':>9} {'z gutter':>9} {'err mm':>9}")
for t, u, z, p, e in rows:
    print(f"{t:7.3f} {u:9.4f} {z:9.4f} {p:9.4f} {e:9.5f}")

print(f"\nWORST deviation of the built centreline from the parabolic gutter:")
print(f"  {worst*1000:.1f} um   (at t={worst_at[0]:.3f}, u={worst_at[1]:.3f})")
print(f"  channel radius is {CHAN_R*1000:.0f} um, so the deviation is "
      f"{100*worst/CHAN_R:.1f} % of it")
verdict = "YES -- the meander lies on a single concave ring surface" if \
    worst < 0.05 else "no -- deviation too large for one profile"
print(f"  => {verdict}")

print("\n" + "=" * 68)
print("GUTTER (concave ring) SPECIFICATION")
print("=" * 68)
depth = 2 * Z_AMP
width = 2 * Am
print(f"  centred at radius R          : {R:.3f} mm")
print(f"  width  (2*A)                 : {width:.3f} mm")
print(f"  depth  (2*z_amp)             : {depth:.3f} mm")
print(f"  profile                      : z = {2*Z_AMP/Am**2:.4f}*u^2 - {Z_AMP:.4f}")
print(f"  radius of curvature at bottom: {Am**2/(4*Z_AMP):.3f} mm")
slope = 4 * Z_AMP * Am / Am ** 2
print(f"  max wall slope (at the rim)  : {slope:.2f} = "
      f"{math.degrees(math.atan(slope)):.1f} deg from horizontal")
print(f"  -> monotonic walls, no undercut: demoulds by lifting straight out")

print("\n" + "=" * 68)
print("WHERE THE FEED MUST EXIT")
print("=" * 68)
print("For the stubs to leave in the FLAT land's parting plane (z = 0), the gap")
print("must sit where the gutter surface crosses z = 0, i.e. f(u) = 0:")
u0 = Am / math.sqrt(2.0)
t0 = math.acos(u0 / Am) / N
print(f"  u0 = A/sqrt(2)      = {u0:.4f} mm   (rho = {R+u0:.3f} mm)")
print(f"  t0 = acos(u0/A)/n   = {t0:.4f} rad = {math.degrees(t0):.2f} deg")
print(f"  check f(u0)         = {profile(u0):+.2e} mm")
print(f"\n  currently the gap is centred at t = 0, i.e. u = +A = {Am:.3f} mm,")
print(f"  which is the gutter RIM at z = {profile(Am):+.3f} mm -- so today the")
print(f"  stubs must ramp {profile(Am):.3f} mm down to reach the flat land.")
print(f"  Moving the gap to t0 = {math.degrees(t0):.2f} deg puts the terminals")
print("  exactly on the z = 0 contour, so the stubs and wells sit IN the flat")
print("  parting plane and nothing crosses it. This is the reposition needed.")
