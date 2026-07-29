#!/usr/bin/env python3
"""Conductor path length, strain response, and the resonance-ORDER question.

Two jobs.

1. **Path length vs strain**, for the z-wave and for the flat control, using the
   exact parametrisation `cst/serp-zwave-feed.vba` builds (note `Cos` for z and
   the `+PI/2` / `+PI` phases -- this file mirrors the CURRENT macro, not the
   older `serp-zwave.vba`). The flat control is the same curve with z_amp = 0.
   The L column is the mechanism: under stretch the flat loop's conductor gets
   longer, the z-wave's barely does.

2. **Is this a full-wave loop or a half-wave resonator?** The slide claims
   "perimeter ~ one wavelength". Free-space lambda at 2.45 GHz is 122.4 mm. So
   compute L, then ask what eps_eff each hypothesis would require:

       full-wave   L = lambda_eff        -> eps_eff = (lambda_0 / L)^2
       half-wave   L = lambda_eff / 2    -> eps_eff = (lambda_0 / (2L))^2

   and judge which is physically possible. eps_eff < 1 is impossible for a
   passive dielectric, so if a hypothesis demands it, that hypothesis is dead.

Strain model: affine, incompressible (nu = 0.5). lam_x = 1+e, lam_t = 1/sqrt(1+e)
applied to y and z. Same transform the CST strain macro applies.
"""

from __future__ import annotations

import math

C_MM_GHZ = 299.792458          # c in mm*GHz

# --- design point, from cst/serp-zwave-feed.vba at serp_R 8.5 ---------------
R = 8.5
AMP_RATIO = 0.2
SERP_RATIO = 0.05
N = 12
GAP = 1.0
Z_RATIO = 0.118117
Z_CYC = 24
PAD_RUN = 3.26
STEPS = 400_000

Am = R * AMP_RATIO             # 1.70
Sk = R * SERP_RATIO            # 0.425
Z_AMP = Z_RATIO * R            # 1.004
OUTER_R = R + Am               # 10.20
PAD_X = OUTER_R + PAD_RUN      # 13.46
PAD_H = 8.0 / 2                # pad_sep/2


def loop_points(strain, z_amp, m=STEPS):
    """The macro's trace curve under affine strain. Yields (x, y, z)."""
    lx, lt = 1.0 + strain, 1.0 / math.sqrt(1.0 + strain)
    s0 = max(R + Am + 2 * Sk * N, 1e-6)      # macro's own s0
    dg = min(GAP / s0, 0.6)
    tA, tB = dg / 2.0, 2.0 * math.pi - dg / 2.0
    for i in range(m + 1):
        t = tA + (tB - tA) * i / m
        uu = R + Am * math.sin(N * t + math.pi / 2)      # = R + Am cos(N t)
        vv = Sk * math.sin(2 * N * t + math.pi)          # = -Sk sin(2N t)
        ct, st = math.cos(t), math.sin(t)
        yield (lx * (uu * ct + vv * st),
               lt * (uu * st - vv * ct),
               lt * z_amp * math.cos(Z_CYC * t))


def arc_length(strain, z_amp, project_flat=False):
    tot = 0.0
    prev = None
    for x, y, z in loop_points(strain, z_amp):
        if project_flat:
            z = 0.0
        if prev is not None:
            tot += math.dist((x, y, z), prev)
        prev = (x, y, z)
    return tot


def stub_length(strain, z_amp):
    """Both stubs: terminal -> radial rim point at land height -> pad."""
    lx, lt = 1.0 + strain, 1.0 / math.sqrt(1.0 + strain)
    s0 = max(R + Am + 2 * Sk * N, 1e-6)
    tA = min(GAP / s0, 0.6) / 2.0
    uu = R + Am * math.sin(N * tA + math.pi / 2)
    vv = Sk * math.sin(2 * N * tA + math.pi)
    ct, st = math.cos(tA), math.sin(tA)
    p = (lx * (uu * ct + vv * st), lt * (uu * st - vv * ct),
         lt * z_amp * math.cos(Z_CYC * tA))
    rho = math.hypot(p[0], p[1]) or 1e-6
    sc = OUTER_R / rho
    rim = (p[0] * sc, p[1] * sc, lt * z_amp)
    pad = (PAD_X, PAD_H, lt * z_amp)
    return math.dist(p, rim) + math.dist(rim, pad)


def report():
    print("=" * 74)
    print("CONDUCTOR PATH LENGTH  (serp_R 8.5, z_amp 1.004, z_cyc 24, gap 1.0)")
    print("=" * 74)
    l3d = arc_length(0.0, Z_AMP)
    lflat_proj = arc_length(0.0, Z_AMP, project_flat=True)
    lctrl = arc_length(0.0, 0.0)
    stubs = 2 * stub_length(0.0, Z_AMP)
    print(f"  z-wave loop, 3D arc length          {l3d:8.2f} mm")
    print(f"  same loop projected onto z=0        {lflat_proj:8.2f} mm")
    print(f"  out-of-plane excess                 {l3d - lflat_proj:8.2f} mm "
          f"({100*(l3d/lflat_proj - 1):.1f} %)")
    print(f"  FLAT CONTROL loop (z_amp = 0)       {lctrl:8.2f} mm")
    print(f"  two feed stubs                      {stubs:8.2f} mm")
    print(f"  TOTAL z-wave conductor  L =         {l3d + stubs:8.2f} mm")
    print(f"  TOTAL flat control      L =         "
          f"{lctrl + 2*stub_length(0.0, 0.0):8.2f} mm")

    print()
    print("=" * 74)
    print("PATH LENGTH vs STRAIN   (affine, incompressible)")
    print("=" * 74)
    print(f"{'strain':>7} | {'z-wave L':>9} {'dL/L':>8} | "
          f"{'flat L':>9} {'dL/L':>8} | {'zw f pred':>10} {'flat f pred':>11}")
    z0 = arc_length(0.0, Z_AMP)
    f0 = arc_length(0.0, 0.0)
    rows = []
    for e in (0.0, 0.05, 0.10, 0.15, 0.20):
        lz = arc_length(e, Z_AMP)
        lf = arc_length(e, 0.0)
        rows.append((e, lz, lf))
        print(f"{100*e:6.0f}% | {lz:9.2f} {100*(lz/z0-1):+7.2f}% | "
              f"{lf:9.2f} {100*(lf/f0-1):+7.2f}% | "
              f"{100*(z0/lz-1):+9.2f}% {100*(f0/lf-1):+10.2f}%")
    print("  ('f pred' = drift predicted by f ~ 1/L alone -- the ARC-LENGTH model)")

    print()
    print("=" * 74)
    print("RESONANCE ORDER:  full-wave loop, or half-wave resonator?")
    print("=" * 74)
    L = l3d + stubs
    Lp = lflat_proj + stubs
    for label, f0_meas in (("bare z-wave loop, delta-gap (zwstrain85)", 2.174),
                           ("flat control, delta-gap (zwflatB)", 2.620),
                           ("design target", 2.450)):
        lam0 = C_MM_GHZ / f0_meas
        print(f"\n  {label}   f0 = {f0_meas:.3f} GHz, lambda_0 = {lam0:.1f} mm")
        for name, Luse in (("3D arc length", L), ("in-plane projection", Lp)):
            full = (lam0 / Luse) ** 2
            half = (lam0 / (2 * Luse)) ** 2
            print(f"    using {name:<20} L = {Luse:6.1f} mm  "
                  f"L/lambda_0 = {Luse/lam0:5.3f}")
            print(f"      full-wave (L = lam_eff)   needs eps_eff = {full:6.3f}"
                  f"{'   <-- IMPOSSIBLE (<1)' if full < 1.0 else ''}")
            print(f"      half-wave (L = lam_eff/2) needs eps_eff = {half:6.3f}"
                  f"{'   <-- IMPOSSIBLE (<1)' if half < 1.0 else ''}")


if __name__ == "__main__":
    report()
