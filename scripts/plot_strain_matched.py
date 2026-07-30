#!/usr/bin/env python3
"""z-wave vs flat control, both RETUNED to 2.44 GHz at 0 % strain.

Same figure as scripts/plot_zwave_vs_flat.py, with one change to the left
panel. There, the two designs sit at their as-simulated resonances -- z-wave
2.174 GHz, flat control 2.620 GHz -- because the flat curve is the z_amp = 0
control at the z-wave's serp_R, deliberately NOT retuned, so that the geometry
stays matched. That makes the left panel almost unreadable as a comparison:
neither curve starts in the BLE band and the eye has nothing to align.

Here both are referred to their own 0 % point and replotted from 2.44 GHz:

    f(e) = 2.44 * (1 + drift(e))

which is what each design would do if its serp_R were retuned to put it in
band at rest. The DRIFT PERCENTAGES ARE UNTOUCHED -- they are the measured
full-wave numbers -- so this adds no new claim; it only re-references the
vertical axis. The assumption being made, and it should be stated on the
slide, is that retuning serp_R shifts f0 without materially changing the drift
percentage. That holds while the loop stays on the same substrate and the same
resonant mode, which is the case over the small retune involved.

Reads deliverables/presentation/F22_resonance_summary.csv, so it needs no CST
licence -- groupmates can regenerate it directly.
"""
from __future__ import annotations

import csv
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "deliverables", "presentation",
                   "F22_resonance_summary.csv")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "deliverables", "strain-zwave-vs-flat-matched.png")

F_TARGET = 2.44
BLE_LO, BLE_HI = 2.400, 2.4835
C_FLAT, C_ZWAVE = "#e74c3c", "#27ae60"


def load():
    rows = {}
    with open(SRC, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows.setdefault(r["design"], []).append(
                (float(r["strain_pct"]), float(r["delta_f_pct"])))
    for k in rows:
        rows[k].sort()
    return rows


def band_exit(series):
    """Strain at which the retuned resonance first drops below the BLE floor."""
    need = 100.0 * (BLE_LO - F_TARGET) / F_TARGET       # drift % at the edge
    prev = None
    for s, d in series:
        if d <= need:
            if prev is None:
                return s
            ps, pd = prev
            return ps + (pd - need) / (pd - d) * (s - ps)
        prev = (s, d)
    return None


data = load()
flat = data["Flat control"]
zwave = data["Z-wave"]

print(f"{'strain':>7} | {'flat GHz':>9} {'flat %':>8} | "
      f"{'zwave GHz':>10} {'zwave %':>8}")
for (s, df), (_, dz) in zip(flat, zwave):
    print(f"{s:6.0f}% | {F_TARGET*(1+df/100):9.4f} {df:+8.2f} | "
          f"{F_TARGET*(1+dz/100):10.4f} {dz:+8.2f}")

xf, xz = band_exit(flat), band_exit(zwave)
print(f"\nleaves the BLE band at:  flat {xf:.2f} %   z-wave {xz:.2f} % strain"
      f"   -> {100*(xz/xf-1):.0f} % more usable strain")

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

# figsize identical to plot_zwave_vs_flat.py so the aspect ratio matches
fig, (axL, axR) = plt.subplots(1, 2, figsize=(13, 5.2))

# --- left: resonance, both retuned to 2.44 GHz at rest ---
axL.axhspan(BLE_LO, BLE_HI, color="#3498db", alpha=0.15, zorder=0)
axL.text(1.0, (BLE_LO + BLE_HI) / 2, "BLE band", va="center", ha="left",
         fontsize=9, color="#1f6391", weight="bold")
axL.plot([s for s, _ in flat], [F_TARGET * (1 + d / 100) for _, d in flat],
         "o-", color=C_FLAT, lw=2, ms=6, label="flat control (z_amp = 0)")
axL.plot([s for s, _ in zwave], [F_TARGET * (1 + d / 100) for _, d in zwave],
         "s-", color=C_ZWAVE, lw=2, ms=6, label="z-wave (z_amp = 1.004)")
for x, c in ((xf, C_FLAT), (xz, C_ZWAVE)):
    axL.plot([x], [BLE_LO], marker="v", color=c, ms=9, zorder=5)
axL.set_xlabel("Uniaxial strain (%)")
axL.set_ylabel("Resonant frequency (GHz)")
axL.set_title("Resonance vs strain — both retuned to 2.44 GHz at rest\n"
              f"leaves BLE at {xf:.1f} % (flat) vs {xz:.1f} % (z-wave) strain")
axL.grid(True, alpha=0.3)
axL.legend(loc="best", fontsize=9)

# --- right: drift, unchanged from the original figure ---
axR.plot([s for s, _ in flat], [d for _, d in flat], "o-", color=C_FLAT,
         lw=2, ms=6, label="flat control (z_amp = 0)")
axR.plot([s for s, _ in zwave], [d for _, d in zwave], "s-", color=C_ZWAVE,
         lw=2, ms=6, label="z-wave (z_amp = 1.004)")
axR.axhline(0, color="#2c3e50", lw=0.8, ls=":")
axR.set_xlabel("Uniaxial strain (%)")
axR.set_ylabel("Resonance drift (%)")
axR.set_title("Frequency drift under stretch\n"
              f"z-wave {zwave[-1][1]:.2f} % vs flat {flat[-1][1]:.2f} % at "
              f"20 % -> a {100*(1-zwave[-1][1]/flat[-1][1]):.0f} % reduction")
axR.grid(True, alpha=0.3)
axR.legend(loc="lower left", fontsize=8)

fig.suptitle("z-wave vs flat control, MATCHED geometry: serp_R 8.5, "
             "sub_h 6.508 mm (on-body, CST)", fontsize=12, weight="bold")
fig.tight_layout()
fig.savefig(OUT, dpi=300)
print("\nwrote", OUT)
