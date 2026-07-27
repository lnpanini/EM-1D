#!/usr/bin/env python3
"""Preview the two gutter mould plates (binary STL) as radial sections + top view."""

from __future__ import annotations

import math
import os
import struct
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.collections import PolyCollection  # noqa: E402

D = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deliverables")
CONCAVE = os.path.join(D, "zwave-mould-concave-forms-upper.stl")
CONVEX = os.path.join(D, "zwave-mould-convex-forms-lower.stl")
OUT = sys.argv[1] if len(sys.argv) > 1 else \
    r"C:\Users\Bryan\Documents\GitHub\EM-1D\deliverables\zwave-gutter-plates.png"
LAND = float(sys.argv[2]) if len(sys.argv) > 2 else 0.8859


def read_binary_stl(path):
    with open(path, "rb") as fh:
        fh.read(80)
        n = struct.unpack("<I", fh.read(4))[0]
        tris = []
        for _ in range(n):
            d = fh.read(50)
            tris.append(tuple(struct.unpack_from("<3f", d, 12 + k * 12)
                              for k in range(3)))
    return tris


def draw(ax, tris, i, j, fc, alpha=0.8, sel=None, lw=0.0):
    src = tris if sel is None else [t for t in tris if sel(t)]
    ax.add_collection(PolyCollection(
        [[(t[k][i], t[k][j]) for k in range(3)] for t in src],
        facecolors=fc, edgecolors="#3f5470" if lw else "none", linewidths=lw,
        alpha=alpha, rasterized=True))
    return len(src)


def draw_height(ax, tris, cmap):
    """Top view coloured by facet height.

    A flat fill renders the plate as a featureless disc: the ring and the
    half-round ridge are sub-millimetre height changes, invisible in plan. Colour
    by z and the meander, the gutter and the well bosses all read at a glance --
    which is the point of a preview you are meant to check.
    """
    up = [t for t in tris
          if (t[1][0]-t[0][0])*(t[2][1]-t[0][1])
          - (t[1][1]-t[0][1])*(t[2][0]-t[0][0]) > 0]      # top surface only
    pc = PolyCollection([[(t[k][0], t[k][1]) for k in range(3)] for t in up],
                        cmap=cmap, rasterized=True, linewidths=0)
    pc.set_array([sum(v[2] for v in t) / 3.0 for t in up])
    ax.add_collection(pc)
    return pc, len(up)


CC = read_binary_stl(CONCAVE)
CX = read_binary_stl(CONVEX)
print(f"concave {len(CC)} facets, convex {len(CX)} facets")

fig, axes = plt.subplots(2, 2, figsize=(15, 10))
(aT, aS), (aT2, aS2) = axes

# Thin wedge near -x (loop angle ~180 deg). NOT +x: that is where the 1 mm feed
# gap sits, so a +x section shows the gutter with NO channel ridge in it and looks
# as though the ridge were missing.
wedge = lambda t: all(abs(v[1]) < 0.25 and v[0] < 0 for v in t)  # noqa: E731

for ax, tris, name, cmap in ((aT, CC, "CONCAVE plate → forms the UPPER layer",
                              "viridis"),
                             (aT2, CX, "CONVEX plate → forms the LOWER layer",
                              "plasma")):
    pc, n = draw_height(ax, tris, cmap)
    ax.set_xlim(-17, 17); ax.set_ylim(-17, 17); ax.set_aspect("equal")
    ax.set_title(f"{name}\ntop view, coloured by height ({n} top facets)")
    ax.set_xlabel("x (mm)"); ax.set_ylabel("y (mm)"); ax.grid(alpha=0.2)
    fig.colorbar(pc, ax=ax, shrink=0.8, label="z (mm)")

for ax, tris, name, colour in ((aS, CC, "CONCAVE", "#6f8bb0"),
                               (aS2, CX, "CONVEX", "#9b7fb0")):
    n = draw(ax, tris, 0, 2, colour, alpha=0.9, sel=wedge, lw=0.2)
    ax.axhline(LAND, color="#16a085", lw=1.3, ls="--",
               label=f"land / parting plane z = {LAND:.3f}")
    ax.set_xlim(-17, 0); ax.set_ylim(-1.6, 3.4); ax.set_aspect("equal")
    ax.set_title(f"{name} plate — radial section at 180° "
                 f"(|y| < 0.25 mm, {n} facets)\n"
                 f"half-round channel ridge visible on the ring")
    ax.set_xlabel("x (mm)"); ax.set_ylabel("z (mm)")
    ax.grid(alpha=0.2); ax.legend(loc="upper left", fontsize=8)

fig.suptitle("Gutter mould: the meander rides a concave ring, so the parting "
             "surface cuts the channel everywhere — no sacrificial core",
             fontsize=13, weight="bold")
fig.tight_layout()
fig.savefig(OUT, dpi=140)
print("wrote", OUT, f"({os.path.getsize(OUT):,} bytes)")
