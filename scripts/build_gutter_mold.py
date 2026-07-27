#!/usr/bin/env python3
"""Generate the two gutter mould plates as binary STL.

THE ARCHITECTURE
work/gutter_check.py showed the channel centreline rests, to 19 um, on a parabolic
concave ring ("gutter"):

    z = f(u) = (2*z_amp/A^2) * u^2 - z_amp,      u = rho - serp_R,  |u| <= A

The gutter surface IS the parting surface, so unlike any flat plane it cuts the
channel along the whole loop -- no sacrificial core needed. Outside the ring the
parting surface is the flat "land" at z = f(+/-A) = +z_amp, which is where the
stubs, wells and pins now live.

Two plates, both flat outside the ring:
    LOWER plate  concave ring  + half-round channel ridge on the ring surface
    UPPER plate  convex  ring  + the same half-round ridge
Cast one part against each, bond at the gutter surface -> full round channel.

WHY GENERATED HERE AND NOT IN CST
The gutter is a revolved parabola and the ridge is a tube swept along a meander
lying ON that curved surface. Expressing that as CST booleans needs a revolve plus
a swept ribbon on a doubly-curved surface, which is fragile. Both surfaces are
analytic, so a direct height-field mesh is exact where it matters and can be
resolved as finely as the printer.

Height field on a POLAR grid, which suits an annular feature: fine in rho across
the ring, fine in theta to resolve 12 lobes x 24 z-cycles. Output is BINARY STL
(an ASCII file at this resolution would be >100 MB).
"""

from __future__ import annotations

import math
import os
import struct
import sys

# ---- design point (overridden by argv: serp_R sub_h) -----------------------
SERP_R = float(sys.argv[1]) if len(sys.argv) > 1 else 7.5
SUB_H = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
Z_RATIO, Z_CYC, N = 0.118117, 24, 12
AMP_RATIO, SERP_RATIO = 0.2, 0.05
CHAN_R, GAP = 0.25, 1.0
PAD_RUN, PAD_SEP, WELL_R = 3.26, 8.0, 0.9

A = SERP_R * AMP_RATIO
SK = SERP_R * SERP_RATIO
Z_AMP = Z_RATIO * SERP_R
LAND = Z_AMP
PAD_X = SERP_R + A + PAD_RUN
PAD_H = PAD_SEP / 2

# ---- tool block ----
R_OUT = PAD_X + WELL_R + 3.0          # plate radius: clears the pads
PLATE_H = 6.0                          # material below the deepest point
N_THETA = 1440                         # 24 z-cycles -> 60 samples/cycle (~33 um arc)
N_RHO_RING = 70                        # across the 2A-wide ring (~43 um)
N_RHO_LAND = 25                        # coarser on the flat land

# Writes straight into deliverables/, because these plates ARE the deliverable and
# are gitignored (31 MB each) -- regenerating is how you obtain them.
OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deliverables")
os.makedirs(OUT_DIR, exist_ok=True)


def gutter(u):
    """Ring cross-section. Flat land beyond |u| = A."""
    if u < -A or u > A:
        return LAND
    return (2.0 * Z_AMP / A ** 2) * u * u - Z_AMP


# ---- the channel path, exactly as the antenna macro builds it --------------
def path_points(m=6000):
    s0 = SERP_R + A + 2 * SK * N
    dg = min(GAP / s0, 0.6)
    tA, tB = dg / 2, 2 * math.pi - dg / 2
    pts = []
    for i in range(m + 1):
        t = tA + (tB - tA) * i / m
        uu = SERP_R + A * math.cos(N * t)
        vv = SK * math.sin(2 * N * t + math.pi)
        x = uu * math.cos(t) + vv * math.sin(t)
        y = uu * math.sin(t) - vv * math.cos(t)
        z = Z_AMP * math.cos(Z_CYC * t)
        pts.append((x, y, z, math.atan2(y, x) % (2 * math.pi)))
    # The two fan-out stubs. THREE points, matching serp-zwave-feed.vba: the gap
    # terminals sit ~0.185 mm down the gutter wall (the gap has width, so its ends
    # are off the rim), so each stub climbs radially to the rim at LAND and only
    # then runs flat. Interpolating straight from terminal to pad -- as this did
    # first -- puts most of the stub BELOW the parting surface.
    outer_r = SERP_R + A
    for sgn in (+1, -1):
        p0 = pts[0] if sgn > 0 else pts[-1]
        rho0 = math.hypot(p0[0], p0[1]) or 1e-6
        sc = outer_r / rho0
        rim = (p0[0] * sc, p0[1] * sc, LAND)
        for k in range(1, 6):                       # short climb up the wall
            s = k / 5
            x = p0[0] + s * (rim[0] - p0[0])
            y = p0[1] + s * (rim[1] - p0[1])
            z = p0[2] + s * (LAND - p0[2])
            pts.append((x, y, z, math.atan2(y, x) % (2 * math.pi)))
        for k in range(1, 61):                      # flat run across the land
            s = k / 60
            x = rim[0] + s * (PAD_X - rim[0])
            y = rim[1] + s * (sgn * PAD_H - rim[1])
            pts.append((x, y, LAND, math.atan2(y, x) % (2 * math.pi)))
    return pts


PATH = path_points()
# bucket the path by theta so the nearest-point search is local, not global
NB = 720
BUCKETS = [[] for _ in range(NB)]
for p in PATH:
    BUCKETS[int(p[3] / (2 * math.pi) * NB) % NB].append(p)


def ridge_height(x, y, zs, mirror):
    """How far the channel tube rises above this plate's surface at (x,y).

    `mirror` reflects the path about the land plane, which is required for the
    convex plate: its surface is 2*LAND - S, so the path must be reflected the
    same way or every distance comes out large and the ridge silently vanishes.
    """
    th = math.atan2(y, x) % (2 * math.pi)
    b = int(th / (2 * math.pi) * NB) % NB
    best = 1e9
    for db_ in (-2, -1, 0, 1, 2):
        for p in BUCKETS[(b + db_) % NB]:
            pz = (2 * LAND - p[2]) if mirror else p[2]
            d = (x - p[0]) ** 2 + (y - p[1]) ** 2 + (zs - pz) ** 2
            if d < best:
                best = d
    if best > CHAN_R * CHAN_R:
        return 0.0
    return math.sqrt(CHAN_R * CHAN_R - best)


def wells_height(x, y, convex):
    """Well bosses. The two plates need DIFFERENT boss heights.

    The well now spans z = -z_amp .. SUB_H/2 (2.41 mm deep) and straddles the
    parting surface at LAND = +z_amp:
      concave plate -> casts the UPPER layer (LAND..SUB_H/2): the well is a
                       THROUGH hole, so the boss must reach the part's top face
                       -> height SUB_H/2 - LAND
      convex  plate -> casts the LOWER layer (-z_amp..LAND): the well is a blind
                       recess -> height LAND - (-z_amp) = 2*z_amp

    Note the convex boss height 2*z_amp is EXACTLY the ring depth, so the well
    boss top comes out coplanar with the ring crest -- which is the condition
    asked for, and it falls out of the geometry rather than being dialled in.
    """
    for sgn in (+1, -1):
        if (x - PAD_X) ** 2 + (y - sgn * PAD_H) ** 2 <= WELL_R * WELL_R:
            return (2.0 * Z_AMP) if convex else (SUB_H / 2 - LAND)
    return 0.0


def surface(x, y, convex):
    """Top surface of a mould plate at (x, y)."""
    u = math.hypot(x, y) - SERP_R
    s = gutter(u)
    if convex:                            # mirror the ring about the land
        s = 2 * LAND - s
    h = ridge_height(x, y, s, convex)
    w = wells_height(x, y, convex)
    return s + max(h, w)


# ---- build the polar grid --------------------------------------------------
def rho_samples():
    """Non-uniform radial sampling: fine wherever a 0.5 mm feature lives.

    The OUTER land carries the stub ridges and the well bosses, so it needs the
    same resolution as the ring -- a coarse outer land quietly smears the stubs
    into the surface. The inner land is empty, so it stays coarse.
    """
    rs = []
    r0, r1 = SERP_R - A, SERP_R + A
    for i in range(N_RHO_LAND):                     # inner land (empty)
        rs.append(r0 * i / N_RHO_LAND)
    for i in range(N_RHO_RING + 1):                 # across the ring
        rs.append(r0 + (r1 - r0) * i / N_RHO_RING)
    n_out = max(4, int((R_OUT - r1) / 0.06))         # ~60 um steps
    for i in range(1, n_out + 1):                   # outer land (stubs, wells)
        rs.append(r1 + (R_OUT - r1) * i / n_out)
    return rs


def write_binary_stl(path, facets):
    with open(path, "wb") as fh:
        fh.write(b"\0" * 80)
        fh.write(struct.pack("<I", len(facets)))
        for a, b, c in facets:
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            fh.write(struct.pack("<3f", nx / L, ny / L, nz / L))
            for p in (a, b, c):
                fh.write(struct.pack("<3f", *p))
            fh.write(b"\0\0")


def build_plate(convex, out_name):
    RS = rho_samples()
    TH = [2 * math.pi * j / N_THETA for j in range(N_THETA)]
    zbot = -PLATE_H

    # top surface height field
    Z = []
    for r in RS:
        row = []
        for th in TH:
            x, y = r * math.cos(th), r * math.sin(th)
            row.append(surface(x, y, convex))
        Z.append(row)

    F = []
    XY = [[(r * math.cos(th), r * math.sin(th)) for th in TH] for r in RS]

    # top
    for i in range(len(RS) - 1):
        for j in range(N_THETA):
            j2 = (j + 1) % N_THETA
            p00 = (XY[i][j][0], XY[i][j][1], Z[i][j])
            p01 = (XY[i][j2][0], XY[i][j2][1], Z[i][j2])
            p10 = (XY[i + 1][j][0], XY[i + 1][j][1], Z[i + 1][j])
            p11 = (XY[i + 1][j2][0], XY[i + 1][j2][1], Z[i + 1][j2])
            F.append((p00, p10, p11))
            F.append((p00, p11, p01))
    # bottom (flat disc)
    ctr = (0.0, 0.0, zbot)
    for j in range(N_THETA):
        j2 = (j + 1) % N_THETA
        F.append((ctr, (XY[-1][j2][0], XY[-1][j2][1], zbot),
                  (XY[-1][j][0], XY[-1][j][1], zbot)))
    # outer skirt
    for j in range(N_THETA):
        j2 = (j + 1) % N_THETA
        a = (XY[-1][j][0], XY[-1][j][1], Z[-1][j])
        b = (XY[-1][j2][0], XY[-1][j2][1], Z[-1][j2])
        c = (XY[-1][j][0], XY[-1][j][1], zbot)
        d = (XY[-1][j2][0], XY[-1][j2][1], zbot)
        F.append((a, c, d))
        F.append((a, d, b))

    out = os.path.join(OUT_DIR, out_name)
    write_binary_stl(out, F)
    zs = [z for row in Z for z in row]
    print(f"{out_name}: {len(F)} facets, z {min(zs):+.3f}..{max(zs):+.3f} mm, "
          f"{os.path.getsize(out):,} bytes")
    return out


if __name__ == "__main__":
    print(f"serp_R {SERP_R}  sub_h {SUB_H}  z_amp {Z_AMP:.4f}  land {LAND:.4f}")
    print(f"ring: centre {SERP_R:.3f}, width {2*A:.3f}, depth {2*Z_AMP:.3f} mm")
    print(f"plate radius {R_OUT:.2f} mm, grid {len(rho_samples())} x {N_THETA}")
    # Naming by WHAT EACH PLATE FORMS, which is the opposite of its own shape:
    #   concave plate -> the UPPER elastomer layer (its underside bulges down)
    #   convex  plate -> the LOWER elastomer layer (its top face is the valley)
    build_plate(False, "zwave-mould-concave-forms-upper.stl")
    build_plate(True, "zwave-mould-convex-forms-lower.stl")
