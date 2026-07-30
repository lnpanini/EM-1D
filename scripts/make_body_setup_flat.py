#!/usr/bin/env python3
"""Flat-design variant of F12 (on-body simulation setup cross-section).

Standalone on purpose: make_presentation_figures.py imports cst.results at module
scope, so it cannot run without CST. F12 is drawn entirely from the macro's
parameters -- no solved data -- so it regenerates anywhere matplotlib exists.

Differences from make_presentation_figures.f12():
  - fully opaque fills (no alpha anywhere)
  - flat styling: no grid, no spines, no patch edges
  - per-layer text colour chosen by background luminance (muscle flips to light)
  - wider/shorter canvas, muscle stub trimmed 12 -> 7 mm
  - x-label is plain "x (mm)"

Usage:  python scripts/make_body_setup_flat.py [outdir]
"""

from __future__ import annotations

import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "deliverables", "presentation")
os.makedirs(OUT, exist_ok=True)

FG = "#e8eef5"
C_ZWAVE = "#f5c518"
DARK_BG = "#111a2b"          # preview copy only; slide version stays transparent
INK = "#10243a"
CHROME = True                # grid + spines, as in the original f12()

# --- geometry: identical to f12(), straight from the macro parameters --------
SUB_H, Z_AMP, GAP = 6.508, 1.004, 1.0
SKIN_T, FAT_T, MUSC_SHOW = 2.0, 5.0, 7.0
HALF_W = 30.0


def _luminance(hex_colour: str) -> float:
    """WCAG relative luminance, for picking readable text on a filled block."""
    r, g, b = (int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
           for c in (r, g, b)]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def _ink_on(bg: str) -> str:
    return INK if _luminance(bg) > 0.35 else "#fdf5f3"


def build(transparent: bool = True):
    z_sub_t, z_sub_b = SUB_H / 2, -SUB_H / 2
    z_sk_t = z_sub_b - GAP
    z_sk_b, z_ft_b = z_sk_t - SKIN_T, z_sk_t - SKIN_T - FAT_T
    z_ms_b = z_ft_b - MUSC_SHOW

    fig, ax = plt.subplots(figsize=(12.4, 5.0))

    blocks = [
        ("Muscle", z_ms_b, z_ft_b, "#c0564a", "ε 52.7   σ 1.74 S/m   70 mm"),
        ("Fat", z_ft_b, z_sk_b, "#f0d9a8", "ε 5.28   σ 0.102 S/m   5 mm"),
        ("Skin", z_sk_b, z_sk_t, "#e2a07a", "ε 38.0   σ 1.46 S/m   2 mm"),
        ("Ecoflex substrate", z_sub_b, z_sub_t, "#f7c9b8",
         "ε 2.6   tan δ 0.03   6.508 mm"),
    ]
    for name, zb, zt, colour, spec in blocks:
        ax.add_patch(plt.Rectangle((-HALF_W, zb), 2 * HALF_W, zt - zb,
                                   facecolor=colour, edgecolor="none",
                                   alpha=1.0, zorder=2))
        ink = _ink_on(colour)
        ax.text(-HALF_W + 1.6, (zb + zt) / 2, name, fontsize=13, weight="bold",
                color=ink, va="center", zorder=3)
        ax.text(HALF_W - 1.6, (zb + zt) / 2, spec, fontsize=10.5,
                color=ink, va="center", ha="right", zorder=3)

    # z-wave channel, schematic: 3 cycles across the 20.4 mm diametral section
    xs = [-10.2 + i * 20.4 / 200 for i in range(201)]
    zc = [Z_AMP * math.cos(2 * math.pi * 3 * (x + 10.2) / 20.4) for x in xs]
    ax.plot(xs, zc, color=C_ZWAVE, lw=3.6, solid_capstyle="round", zorder=4,
            label="EGaIn channel, Ø0.5 mm (z-wave, ±1.004 mm)")

    # dimensions sit outside the slab so they cannot collide with block text.
    # The air gap is only 1 mm -- far shorter than a double-arrow's own heads at
    # this aspect -- so it gets a plain leader into the gap instead.
    z_gap_mid = (z_sub_b + z_sk_t) / 2
    ax.plot([-HALF_W - 4.5, -HALF_W - 0.5], [z_gap_mid, z_gap_mid],
            color=FG, lw=1.3, solid_capstyle="butt", zorder=3)
    ax.text(-HALF_W - 5.6, z_gap_mid, "1.0 mm\nair gap", fontsize=10.5,
            color=FG, va="center", ha="right")

    xc = HALF_W + 5
    ax.annotate("", xy=(xc, 0), xytext=(xc, z_sk_t),
                arrowprops=dict(arrowstyle="<->", color=C_ZWAVE, lw=1.5,
                                shrinkA=0, shrinkB=0))
    ax.text(xc + 1.4, z_sk_t / 2, "conductor → skin\n4.25 mm", fontsize=10.5,
            color=C_ZWAVE, va="center", ha="left")

    ax.text(0, z_ms_b - 0.5, "muscle continues to 70 mm (truncated for clarity)",
            fontsize=9.5, color=FG, ha="center", va="top")

    ax.set_facecolor("none")   # let the slide (or DARK_BG) show through
    ax.set_xlim(-HALF_W - 16, HALF_W + 22)
    ax.set_ylim(z_ms_b - 2.6, z_sub_t + 4.4)
    ax.set_xlabel("x (mm)")
    ax.set_ylabel("z (mm)")
    ax.set_title("On-body simulation setup — 3-layer flat phantom\n"
                 "tissue values IT'IS/Gabriel at 2.45 GHz; open boundaries, "
                 "λ/8 background", fontsize=13, color=FG)
    ax.legend(loc="upper left", frameon=False, fontsize=10.5,
              labelcolor=FG)

    # Grid sits BELOW the blocks: the fills are opaque now, so it shows only in
    # the margins. In the translucent original it appeared to run through the
    # layers -- that was the alpha, not the grid. Set CHROME=False for the
    # no-grid/no-spine look.
    if CHROME:
        ax.set_axisbelow(True)
        ax.grid(True, color=FG, alpha=0.15, lw=0.8)
        for s in ax.spines.values():
            s.set_visible(True)
            s.set_color(FG)
            s.set_alpha(0.5)
        ax.tick_params(colors=FG, labelsize=11)
    else:
        ax.grid(False)
        for s in ax.spines.values():
            s.set_visible(False)
        ax.tick_params(colors=FG, length=0, labelsize=11)
    ax.xaxis.label.set_color(FG)
    ax.yaxis.label.set_color(FG)

    fig.tight_layout()
    if transparent:
        path = os.path.join(OUT, "F12_body_setup_flat.png")
        fig.savefig(path, dpi=200, transparent=True)
    else:
        path = os.path.join(OUT, "F12_body_setup_flat_dark.png")
        fig.savefig(path, dpi=200, facecolor=DARK_BG, transparent=False)
    plt.close(fig)
    print("wrote", path)


if __name__ == "__main__":
    build(transparent=True)    # drop-in slide version (transparent, like F1-F23)
    build(transparent=False)   # opaque copy, for previewing outside the deck
