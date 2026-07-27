#!/usr/bin/env python3
"""Analytical strain drift of the z-wave loop, from the CST macro's own geometry.

The a/lambda_z ~ 0.183 optimum and the "0.112 % drift at 20 % strain" figure in
ZWAVE-HANDOFF.md were derived off-repo and DESIGN-EVOLUTION.md §6 lists them as
original and unvalidated. This reproduces them independently, using the exact
parametrisation `serp-zwave.vba` builds, so the CST sweep has a prediction to be
checked against rather than a remembered number.

The curve, straight out of the macro's trace block:

    uu = R + A sin(n t)
    vv = S sin(2 n t)
    P(t) = ( lam_x (uu cos t + vv sin t),
             lam_t (uu sin t - vv cos t),
             lam_t a sin(m t) )

with lam_x = 1 + e and lam_t = 1/sqrt(1+e) (incompressible, nu = 0.5).

Resonance of a loop goes as 1/path, so df/f = -dL/L and the drift is read
straight off the 3D arc length.

One thing worth being explicit about: the z-wave is sinusoidal in the LOOP
ANGLE t, not in arc length. |dP/dt| varies along a serpentine, so the physical
z-wavelength breathes around the loop and the closed-form "a/lambda_z" is only
an average. Integrating the real curve is what settles it.
"""

from __future__ import annotations

import math

# Design point, matching serp-zwave.vba.
R = 8.95
AMP_RATIO = 0.2
SERP_RATIO = 0.05
N = 12
GAP = 1.0
M_INT = 200_000          # integration steps; the z-wave needs a fine grid


def path_length(strain, z_amp, z_cyc, R=R, m=M_INT):
    """3D arc length of the affinely-strained z-wave loop."""
    Am, Sk = R * AMP_RATIO, R * SERP_RATIO
    lx, lt = 1 + strain, 1 / math.sqrt(1 + strain)
    s0 = math.hypot(Am * N, R - 2 * N * Sk)
    dg = min(GAP / max(s0, 1e-6), 0.6)
    tA, tB = dg / 2, 2 * math.pi - dg / 2

    total = 0.0
    px = py = pz = None
    for i in range(m + 1):
        t = tA + (tB - tA) * i / m
        uu = R + Am * math.sin(N * t)
        vv = Sk * math.sin(2 * N * t)
        ct, st = math.cos(t), math.sin(t)
        x = lx * (uu * ct + vv * st)
        y = lt * (uu * st - vv * ct)
        z = lt * z_amp * math.sin(z_cyc * t)
        if px is not None:
            total += math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2)
        px, py, pz = x, y, z
    return total


def drift(z_amp, z_cyc, strain=0.20, R=R):
    """Fractional resonance shift, in percent. f ~ 1/L  =>  df/f = L0/L - 1."""
    L0 = path_length(0.0, z_amp, z_cyc, R)
    Le = path_length(strain, z_amp, z_cyc, R)
    return 100.0 * (L0 / Le - 1.0), L0, Le


def solve_optimum(z_cyc, strain=0.20, lo=0.0, hi=3.0, iters=60, R=R):
    """Bisect for the z_amp that nulls the drift.

    Drift rises monotonically with z_amp over this range (more out-of-plane
    slack -> less of the in-plane stretch reaches the conductor), crossing zero
    once, so bisecting the drift itself is enough and is more robust than
    chasing a derivative.
    """
    f_lo = drift(lo, z_cyc, strain, R=R)[0]
    f_hi = drift(hi, z_cyc, strain, R=R)[0]
    if f_lo * f_hi > 0:
        return None, f_lo, f_hi
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        f_mid = drift(mid, z_cyc, strain, R=R)[0]
        if f_lo * f_mid <= 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
        if hi - lo < 1e-9:
            break
    return 0.5 * (lo + hi), f_lo, f_hi


if __name__ == "__main__":
    print("=" * 74)
    print("FLAT reference (z_amp = 0), for the same loop")
    print("=" * 74)
    L0_flat = path_length(0.0, 0.0, 24)
    print(f"  unstrained path                  {L0_flat:8.3f} mm")
    for e in (0.05, 0.10, 0.15, 0.20):
        d, _, Le = drift(0.0, 24, e)
        print(f"  strain {e*100:5.1f} %   path {Le:8.3f} mm   drift {d:+8.3f} %")

    print()
    print("=" * 74)
    print("Z-WAVE at the handoff design point  (z_amp = 0.923, z_cyc = 24)")
    print("=" * 74)
    L0_z = path_length(0.0, 0.923, 24)
    print(f"  unstrained 3D path               {L0_z:8.3f} mm"
          f"   (+{100*(L0_z/L0_flat-1):.1f} % over flat)")
    for e in (0.05, 0.10, 0.15, 0.20):
        d, _, Le = drift(0.923, 24, e)
        print(f"  strain {e*100:5.1f} %   path {Le:8.3f} mm   drift {d:+8.3f} %")

    print()
    print("=" * 74)
    print("Optimum z_amp per z_cyc  (drift nulled at 20 % strain)")
    print("=" * 74)
    print(f"  {'z_cyc':>6} {'z_amp opt':>11} {'a/lam_z':>9} {'envelope':>10} "
          f"{'drift@20%':>11} {'crest rad':>10}")
    for zc in (12, 24, 32, 48):
        a_opt, _, _ = solve_optimum(zc)
        if a_opt is None:
            print(f"  {zc:6d}   no sign change in [0, 3] mm")
            continue
        d20 = drift(a_opt, zc)[0]
        # lambda_z measured in ARC LENGTH along the unstrained curve, which is
        # the only definition under which a/lambda_z can be scale-invariant.
        lam_z = L0_flat / zc
        # crest curvature radius of a sinusoid, rho = lambda^2 / (4 pi^2 a)
        rho = lam_z ** 2 / (4 * math.pi ** 2 * a_opt)
        print(f"  {zc:6d} {a_opt:11.4f} {a_opt/lam_z:9.4f} "
              f"{2*a_opt:9.3f}mm {d20:+11.4f} {rho:9.3f}mm")

    print()
    print("  (envelope = peak-to-peak 2*z_amp; the substrate must bury this plus")
    print("   cover. crest radius must stay above chan_r = 0.25 mm.)")
