#!/usr/bin/env python3
"""Unrolled conductor path length L, and the full-wave-vs-half-wave question.

WHY THIS EXISTS
The working-principles slide claims the loop resonates when its perimeter is
about one wavelength. That is testable: integrate the exact curve the CST macro
builds, then compare L against lambda_eff = c / (f sqrt(eps_eff)). If
L ~ lambda_eff the slide is sound; if L ~ lambda_eff/2 the structure is a
half-wave resonator and the slide is wrong.

The curve is taken straight from the trace block of cst/serp-zwave-feed.vba:

    uu = R + A sin(n t)
    vv = S sin(2 n t)
    P(t) = ( lam_x (uu cos t + vv sin t),
             lam_t (uu sin t - vv cos t),
             lam_t a cos(m t) )          <- Cos, even in t (mirror plane)

with lam_x = 1 + e, lam_t = 1/sqrt(1+e): incompressible affine strain, nu = 0.5.
The conductor is a closed ring broken by feed_gap, so the integration runs
between the gap terminals, not over the full 2 pi.
"""

from __future__ import annotations

import math

C_MM_GHZ = 299.792458          # c in mm*GHz

# --- design point, from work/zwfinal-fab.cst run 0 -------------------------
R = 8.5
AMP_RATIO = 0.2
SERP_RATIO = 0.05
N = 12
Z_AMP = 1.0039945
Z_CYC = 24
GAP = 1.0
STEPS = 400_000


def path_length(strain=0.0, z_amp=Z_AMP, R=R, z_cyc=Z_CYC):
    Am, Sk = R * AMP_RATIO, R * SERP_RATIO
    lx, lt = 1 + strain, 1 / math.sqrt(1 + strain)
    s0 = math.hypot(Am * N, R - 2 * N * Sk)
    dg = min(GAP / max(s0, 1e-6), 0.6)
    tA, tB = dg / 2, 2 * math.pi - dg / 2

    total = 0.0
    inplane = 0.0
    px = py = pz = None
    for i in range(STEPS + 1):
        t = tA + (tB - tA) * i / STEPS
        uu = R + Am * math.sin(N * t)
        vv = Sk * math.sin(2 * N * t)
        ct, st = math.cos(t), math.sin(t)
        x = lx * (uu * ct + vv * st)
        y = lt * (uu * st - vv * ct)
        z = lt * z_amp * math.cos(z_cyc * t)
        if px is not None:
            dx, dy, dz = x - px, y - py, z - pz
            total += math.sqrt(dx * dx + dy * dy + dz * dz)
            inplane += math.hypot(dx, dy)
        px, py, pz = x, y, z
    return total, inplane


def z_height(strain=0.0, z_amp=Z_AMP):
    """Peak-to-peak out-of-plane excursion at a given strain."""
    return 2.0 * z_amp / math.sqrt(1 + strain)


def apex_angle(strain=0.0, z_amp=Z_AMP, R=R, z_cyc=Z_CYC):
    """Full included angle at a z-wave crest, in the (arc-length, z) plane.

    The crest is where cos(m t) = +-1. Approximate the local zigzag by the
    straight segments either side of the crest: half a z-period long in arc
    length, z_amp tall. The included angle is 2*atan(run/rise) per side.
    """
    L3, _ = path_length(strain, z_amp, R, z_cyc)
    half_period = L3 / z_cyc / 2.0        # arc length of one rise or fall
    rise = 2.0 * z_amp / math.sqrt(1 + strain)
    run = math.sqrt(max(half_period ** 2 - rise ** 2, 1e-12))
    return 2.0 * math.degrees(math.atan2(run, rise))


def eps_eff_from(f_ghz, L_mm, order=1.0):
    """eps_eff implied by 'L = order * lambda_eff' at f_ghz."""
    lam_eff = L_mm / order
    return (C_MM_GHZ / (f_ghz * lam_eff)) ** 2


if __name__ == "__main__":
    print("=" * 74)
    print("CONDUCTOR PATH LENGTH  (serp_R 8.5, z_amp 1.004, z_cyc 24, gap 1.0)")
    print("=" * 74)
    Lz0, ip_z0 = path_length(0.0, Z_AMP)
    Lf0, ip_f0 = path_length(0.0, 0.0)
    print(f"z-wave  L(0%) = {Lz0:8.3f} mm   (in-plane part {ip_z0:7.3f} mm)")
    print(f"flat    L(0%) = {Lf0:8.3f} mm   (in-plane part {ip_f0:7.3f} mm)")
    print(f"z-wave adds {Lz0 - Lf0:.3f} mm = {100*(Lz0/Lf0 - 1):.2f} %\n")

    print(f"{'strain':>7} {'L z-wave':>10} {'dL/L':>8} "
          f"{'L flat':>10} {'dL/L':>8} {'z p-p':>8} {'apex deg':>9}")
    for e in (0.0, 0.05, 0.10, 0.15, 0.20):
        Lz, _ = path_length(e, Z_AMP)
        Lf, _ = path_length(e, 0.0)
        print(f"{e*100:6.0f}% {Lz:10.3f} {100*(Lz/Lz0-1):+7.2f}% "
              f"{Lf:10.3f} {100*(Lf/Lf0-1):+7.2f}% "
              f"{z_height(e):8.3f} {apex_angle(e):9.2f}")

    print("\n" + "=" * 74)
    print("FULL-WAVE OR HALF-WAVE?")
    print("=" * 74)
    lam0 = C_MM_GHZ / 2.45
    print(f"free-space lambda at 2.45 GHz      = {lam0:.2f} mm")
    print(f"conductor path length L            = {Lz0:.2f} mm")
    print(f"L / lambda_0                       = {Lz0/lam0:.3f}\n")
    for order, name in ((1.0, "full-wave loop  (L = 1.0 lambda_eff)"),
                        (0.5, "half-wave       (L = 0.5 lambda_eff)")):
        ee = eps_eff_from(2.45, Lz0, order)
        print(f"{name}: requires eps_eff = {ee:6.3f}")
    print("\nEcoflex bulk eps_r = 2.6; an embedded conductor with air above and "
          "\ntissue below must land BETWEEN 1 and ~2.6 (higher only if the body "
          "\ndominates, since muscle is eps_r ~ 52 at 2.45 GHz).")
