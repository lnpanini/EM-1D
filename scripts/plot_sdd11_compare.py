#!/usr/bin/env python3
"""Differential match, final flat serpentine vs final z-wave, on one axis.

WHICH RUNS, AND WHY IT MATTERS
Both sides are selected by MATCHING PARAMETERS, never by max(run_id): CST puts
the current parameter set in run_id 0 and pushes stored combinations to higher
ids, so "newest id" can be an older solve (see ZWAVE-FEED-FINDINGS.md).

  flat   work/param-sim.cst     serp_R 8.95, sub_h 1.948   (its own tuned design)
  z-wave work/zwave-feed3.cst   serp_R 8.50, sub_h 6.508   (run 10)

The z-wave side MUST come from zwave-feed3: its model history is byte-identical
to work/zwfinal-fab.cst, the project the STEP and the mould plates were exported
from. zwave-feed2 has the same parameter names and values but an OLDER geometry
-- shallow 0.66 mm wells and stubs that do not lie in the land plane -- so its
numbers describe an antenna that is not the one being built.

NOT A CONTROLLED COMPARISON. These are two separately tuned designs on different
substrates (1.95 mm vs 6.51 mm), so the difference mixes the z-wave's cost with
the thicker slab's. The controlled experiment is the strain figure, where the
flat control sits at the z-wave's own serp_R and sub_h with z_amp = 0.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.results as cr  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "1D Results\\S-Parameters\\"
BLE_LO, BLE_HI = 2.400, 2.4835
F0 = 2.44

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "deliverables", "cst")
OUT = os.path.join(OUTDIR, "sdd11-flat-vs-zwave.png")
OUT_VSWR = os.path.join(OUTDIR, "vswr-flat-vs-zwave.png")


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -120.0


def sdd11(projname, **want):
    """Sdd11 vs frequency for the run whose parameters match `want`."""
    pf = cr.ProjectFile(os.path.join(ROOT, "work", projname),
                        allow_interactive=True)
    mod = pf.get_3d()
    for rid in sorted(mod.get_all_run_ids()):
        try:
            pc = mod.get_parameter_combination(rid)
        except Exception:
            continue
        if any(pc.get(k) is None or abs(float(pc[k]) - v) > 1e-3
               for k, v in want.items()):
            continue
        S = {}
        try:
            for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
                it = mod.get_result_item(BASE + nm, rid)
                xs = [float(x) for x in it.get_xdata()]
                ys = [complex(y) for y in it.get_ydata()]
                if not xs:
                    raise RuntimeError("empty")
                S[nm] = (xs, ys)
        except Exception:
            continue
        f = S["S1,1"][0]
        sdd = [(a - b - c + d) / 2 for a, b, c, d in
               zip(S["S1,1"][1], S["S1,2"][1], S["S2,1"][1], S["S2,2"][1])]
        return rid, f, [db(z) for z in sdd]
    raise SystemExit(f"no run in {projname} matching {want}")


def at(f, y, target):
    return y[min(range(len(f)), key=lambda i: abs(f[i] - target))]


def worst_in_band(f, y):
    ks = [i for i in range(len(f)) if BLE_LO <= f[i] <= BLE_HI]
    return max(y[i] for i in ks) if ks else float("nan")


rid_f, ff, yf = sdd11("param-sim.cst", serp_R=8.95)
rid_z, fz, yz = sdd11("zwave-feed3.cst", serp_R=8.5, sub_h=6.508)

for nm, rid, f, y in (("flat  ", rid_f, ff, yf), ("z-wave", rid_z, fz, yz)):
    print(f"{nm} run {rid:>2}: Sdd11@2.44 = {at(f, y, F0):+6.2f} dB, "
          f"worst in BLE = {worst_in_band(f, y):+6.2f} dB, "
          f"min = {min(y):+6.2f} dB @ {f[y.index(min(y))]:.3f} GHz")

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

fig, ax = plt.subplots(figsize=(10, 5.8))

ax.set_xlim(min(ff[0], fz[0]), max(ff[-1], fz[-1]))
ax.set_ylim(-11.0, -1.0)

ax.axvspan(BLE_LO, BLE_HI, color="#3498db", alpha=0.15, zorder=0)
ax.annotate("BLE", xy=((BLE_LO + BLE_HI) / 2, 0.97),
            xycoords=("data", "axes fraction"), ha="center", va="top",
            fontsize=9, color="#1f6391", weight="bold")
ax.axhline(-10, color="#7f8c8d", lw=0.9, ls="--", zorder=1)
ax.annotate("  -10 dB reference — neither design reaches it", xy=(0.0, -10),
            xycoords=("axes fraction", "data"), va="bottom", ha="left",
            fontsize=8, color="#7f8c8d")

ax.plot(ff, yf, "-", color="#e74c3c", lw=2,
        label="flat serpentine  serp_R 8.95, sub_h 1.95 mm")
ax.plot(fz, yz, "-", color="#27ae60", lw=2,
        label="z-wave  serp_R 8.50, sub_h 6.51 mm, z_amp 1.004, z_cyc 24")

for f, y, c in ((ff, yf, "#e74c3c"), (fz, yz, "#27ae60")):
    v = at(f, y, F0)
    ax.plot([F0], [v], "o", color=c, ms=8, mec="white", mew=1.4, zorder=5)
    ax.annotate(f"{v:.2f} dB", (F0, v), textcoords="offset points",
                xytext=(10, -4), fontsize=10, color=c, weight="bold")

ax.set_xlabel("Frequency (GHz)")
ax.set_ylabel(r"$S_{dd11}$ (dB, 100 $\Omega$ reference)")
ax.set_title("Differential match at 2.44 GHz — final flat serpentine vs final z-wave\n"
             "two separately tuned designs on different substrates, not a controlled pair",
             fontsize=11)
ax.grid(True, alpha=0.3)
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), fontsize=9,
          frameon=False, ncol=1)

fig.tight_layout()
fig.savefig(OUT, dpi=150)
print(f"wrote {OUT}")

# ---------------------------------------------------------------- VSWR ------
# CST stores no VSWR result item -- it renders VSWR on demand in the GUI, which
# is why an earlier export produced "VSWR" PNGs that were byte-identical copies
# of the S11 plots. Compute it instead, and compute the DIFFERENTIAL one: this
# antenna is balanced, so single-ended VSWR is as misleading as single-ended S11.
def vswr(y_db):
    out = []
    for d in y_db:
        g = min(10 ** (d / 20.0), 0.999999)
        out.append((1 + g) / (1 - g))
    return out


vf, vz = vswr(yf), vswr(yz)

fig2, ax2 = plt.subplots(figsize=(10, 5.8))
ax2.set_xlim(min(ff[0], fz[0]), max(ff[-1], fz[-1]))
ax2.set_ylim(1.0, 12.0)
ax2.axvspan(BLE_LO, BLE_HI, color="#3498db", alpha=0.15, zorder=0)
ax2.annotate("BLE", xy=((BLE_LO + BLE_HI) / 2, 0.97),
             xycoords=("data", "axes fraction"), ha="center", va="top",
             fontsize=9, color="#1f6391", weight="bold")
for lvl, lbl in ((2.0, "VSWR 2 (= -9.5 dB)"), (3.0, "VSWR 3 (= -6.0 dB)")):
    ax2.axhline(lvl, color="#7f8c8d", lw=0.9, ls="--", zorder=1)
    ax2.annotate(f"  {lbl}", xy=(0.0, lvl), xycoords=("axes fraction", "data"),
                 va="bottom", ha="left", fontsize=8, color="#7f8c8d")

ax2.plot(ff, vf, "-", color="#e74c3c", lw=2,
         label="flat serpentine  serp_R 8.95, sub_h 1.95 mm")
ax2.plot(fz, vz, "-", color="#27ae60", lw=2,
         label="z-wave  serp_R 8.50, sub_h 6.51 mm, z_amp 1.004, z_cyc 24")
for f, v, c in ((ff, vf, "#e74c3c"), (fz, vz, "#27ae60")):
    val = at(f, v, F0)
    ax2.plot([F0], [val], "o", color=c, ms=8, mec="white", mew=1.4, zorder=5)
    ax2.annotate(f"{val:.2f}", (F0, val), textcoords="offset points",
                 xytext=(10, -4), fontsize=10, color=c, weight="bold")

ax2.set_xlabel("Frequency (GHz)")
ax2.set_ylabel("Differential VSWR")
ax2.set_title("Differential VSWR — final flat serpentine vs final z-wave\n"
              "computed from $S_{dd11}$; CST stores no VSWR result item",
              fontsize=11)
ax2.grid(True, alpha=0.3)
ax2.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), fontsize=9,
           frameon=False, ncol=1)
fig2.tight_layout()
fig2.savefig(OUT_VSWR, dpi=150)
print(f"wrote {OUT_VSWR}")
print(f"VSWR @ 2.44 -- flat {at(ff, vf, F0):.2f}, z-wave {at(fz, vz, F0):.2f}")
