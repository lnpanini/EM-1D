#!/usr/bin/env python3
"""Explain sub_h and 'cover', and why the scan should hold cover constant."""

from __future__ import annotations

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Circle, Rectangle  # noqa: E402

Z_RATIO, CHAN_R = 0.118117, 0.25
OUT = r"C:\Users\Bryan\Documents\GitHub\EM-1D\deliverables\subh-cover-explained.png"

R, SUB_H = 7.7, 3.0
Z_AMP = Z_RATIO * R
COVER = SUB_H / 2 - (Z_AMP + CHAN_R)

fig, (axA, axB) = plt.subplots(1, 2, figsize=(14.5, 5.8))

# ---------------- left: the cross-section, labelled ----------------
axA.add_patch(Rectangle((-4, -SUB_H / 2), 8, SUB_H, facecolor="#f2ddd4",
                        edgecolor="#8a6a5e", lw=1.6, zorder=1))
# channel at its crest (left) and its trough (right)
for xc, zc, lbl in ((-2.0, +Z_AMP, "channel at a CREST"),
                    (2.0, -Z_AMP, "channel at a TROUGH")):
    axA.add_patch(Circle((xc, zc), CHAN_R, facecolor="#c8912a",
                         edgecolor="#8a6a1e", lw=1.2, zorder=5))
    axA.annotate(lbl, xy=(xc, zc), xytext=(xc, 2.6 if zc > 0 else -2.75),
                 ha="center", fontsize=8, color="#8a4b08",
                 arrowprops=dict(arrowstyle="->", color="#8a4b08", lw=1))

# sub_h dimension
axA.annotate("", xy=(-3.6, -SUB_H / 2), xytext=(-3.6, SUB_H / 2),
             arrowprops=dict(arrowstyle="<->", color="#1f3b5c", lw=1.6))
axA.text(-3.5, 0, f"  sub_h = {SUB_H:.2f} mm\n  (whole slab thickness)",
         va="center", fontsize=10, color="#1f3b5c", weight="bold")

# cover dimension, top face
axA.annotate("", xy=(-2.0, Z_AMP + CHAN_R), xytext=(-2.0, SUB_H / 2),
             arrowprops=dict(arrowstyle="<->", color="#c0392b", lw=1.8))
axA.text(-1.75, (Z_AMP + CHAN_R + SUB_H / 2) / 2,
         f"cover = {COVER:.3f} mm", fontsize=10, color="#c0392b", weight="bold")

# z_amp
axA.annotate("", xy=(0.0, 0), xytext=(0.0, Z_AMP),
             arrowprops=dict(arrowstyle="<->", color="#16a085", lw=1.4))
axA.text(0.1, Z_AMP / 2, f"z_amp = {Z_AMP:.3f}", fontsize=9, color="#16a085")
axA.axhline(0, color="#95a5a6", lw=0.8, ls=":")
axA.text(3.9, 0.05, "slab mid-plane", ha="right", fontsize=8, color="#7f8c8d")
axA.annotate(f"chan_r = {CHAN_R}", xy=(2.0 + CHAN_R * 0.7, -Z_AMP - CHAN_R * 0.7),
             xytext=(3.2, -1.35), fontsize=8, color="#8a4b08",
             arrowprops=dict(arrowstyle="->", color="#8a4b08", lw=0.9))

axA.set_xlim(-4.4, 4.4); axA.set_ylim(-3.1, 3.1); axA.set_aspect("equal")
axA.set_ylabel("z (mm)")
axA.set_title("What the two numbers are\n"
              "cover = sub_h/2 − (z_amp + chan_r), on each face")
axA.set_xticks([])
axA.grid(alpha=0.15, axis="y")

# ---------------- right: why fixed sub_h slides down a cliff ----------------
rs = [7.5 + 0.1 * i for i in range(21)]
cov_fixed = [SUB_H / 2 - (Z_RATIO * r + CHAN_R) for r in rs]
axB.plot(rs, cov_fixed, "o-", color="#c0392b", lw=2, ms=4,
         label=f"cover, if sub_h held at {SUB_H:.1f} mm")
axB.axhline(0.35, color="#16a085", lw=2, ls="-",
            label="cover, if HELD constant at 0.35 mm\n(sub_h grows to suit)")
axB.axhline(0, color="#2c3e50", lw=1.2, ls="--")
axB.text(9.35, 0.02, "channel breaks the face", fontsize=8, color="#2c3e50",
         ha="right")
axB.fill_between(rs, 0, 0.2, color="#c0392b", alpha=0.10)
axB.text(7.6, 0.09, "too thin to trust", fontsize=8, color="#c0392b")

# the sub_h you'd need at constant cover
sub_needed = [2 * (Z_RATIO * r + CHAN_R + 0.35) for r in rs]
ax2 = axB.twinx()
ax2.plot(rs, sub_needed, "s--", color="#16a085", lw=1.6, ms=3, alpha=0.85)
ax2.set_ylabel("sub_h needed at constant 0.35 mm cover (mm)",
               color="#16a085")
ax2.tick_params(axis="y", colors="#16a085")
ax2.axhline(6.0, color="#7f8c8d", lw=1, ls=":")
ax2.text(9.5, 6.05, "6 mm budget", fontsize=8, color="#7f8c8d", ha="right")
ax2.set_ylim(2.5, 6.4)

axB.set_xlabel("serp_R (mm)")
axB.set_ylabel("cover (mm)", color="#c0392b")
axB.tick_params(axis="y", colors="#c0392b")
axB.set_ylim(-0.05, 0.55)
axB.set_title("Why the scan was mis-parameterised\n"
              "z_amp = 0.1181·serp_R, so a fixed sub_h thins the cover as the "
              "loop grows")
axB.grid(alpha=0.25)
axB.legend(loc="upper right", fontsize=8)

fig.suptitle("sub_h = slab thickness.   cover = elastomer left over the channel "
             "— the wall that holds the liquid metal in.",
             fontsize=12, weight="bold")
fig.tight_layout()
fig.savefig(OUT, dpi=140)
print("wrote", OUT, f"({os.path.getsize(OUT):,} bytes)")
print()
print(f"{'serp_R':>7} {'z_amp':>7} | {'cover @ sub_h=3.0':>18} | "
      f"{'sub_h for 0.35 cover':>21}")
for r in (7.7, 8.1, 8.5, 8.9, 9.3):
    print(f"{r:7.2f} {Z_RATIO*r:7.3f} | {SUB_H/2-(Z_RATIO*r+CHAN_R):18.3f} | "
          f"{2*(Z_RATIO*r+CHAN_R+0.35):21.3f}")
