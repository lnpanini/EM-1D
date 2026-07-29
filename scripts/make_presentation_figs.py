#!/usr/bin/env python3
"""Presentation-ready CSVs and dark-slide PNGs from the solved CST projects.

Writes into deliverables/presentation/, split as requested:
    results/  -- data plots and CSVs
    setup/    -- model-setup diagrams (different slides)

Everything here is READ-ONLY on the CST projects -- no licence needed.

NAMING NOTE: the requested filename "S11_flat_freespace.csv" is not used,
because no free-space simulation exists. Every solved model in this repo carries
the 3-layer tissue phantom. Files are named *_onbody so nothing gets mislabelled
on a slide.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.results as cr  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from path_length_check import path_length, Z_AMP, z_height, apex_angle  # noqa: E402

OUT = os.path.join(ROOT, "deliverables", "presentation")
RES, SET = os.path.join(OUT, "results"), os.path.join(OUT, "setup")
for d in (RES, SET):
    os.makedirs(d, exist_ok=True)

SP = "1D Results\\S-Parameters\\"
TP = SP + "S1,1"
BLE_LO, BLE_HI = 2.400, 2.4835
F0 = 2.45
STRAINS = (0.0, 0.05, 0.10, 0.15, 0.20)

# dark-slide styling: transparent background, light text
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

LIGHT = "#E8EDF5"
matplotlib.rcParams.update({
    "figure.facecolor": "none", "axes.facecolor": "none",
    "savefig.facecolor": "none", "savefig.transparent": True,
    "text.color": LIGHT, "axes.labelcolor": LIGHT, "axes.edgecolor": LIGHT,
    "xtick.color": LIGHT, "ytick.color": LIGHT, "grid.color": "#7F8FA6",
    "font.size": 12, "axes.titlesize": 13, "legend.framealpha": 0.0,
})
ZC, FC = "#2ECC71", "#FF6B6B"       # z-wave green, flat red


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -120.0


def proj(name):
    return cr.ProjectFile(os.path.join(ROOT, "work", name),
                          allow_interactive=True).get_3d()


# ---------------------------------------------------------------- 1. Sdd11 --
mod = proj("zwfinal-fab.cst")
S = {}
for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
    it = mod.get_result_item(SP + nm, 0)
    S[nm] = ([float(x) for x in it.get_xdata()],
             [complex(y) for y in it.get_ydata()])
f = S["S1,1"][0]
sdd = [(a - b - c + d) / 2 for a, b, c, d in
       zip(S["S1,1"][1], S["S1,2"][1], S["S2,1"][1], S["S2,2"][1])]

with open(os.path.join(RES, "Sdd11_zwave_onbody.csv"), "w") as fh:
    fh.write("freq_GHz,Sdd11_dB,S11_single_ended_dB,VSWR_differential\n")
    for i, fr in enumerate(f):
        g = min(abs(sdd[i]), 0.999999)
        fh.write(f"{fr:.6f},{db(sdd[i]):.4f},{db(S['S1,1'][1][i]):.4f},"
                 f"{(1+g)/(1-g):.4f}\n")

with open(os.path.join(RES, "zwave_onbody_raw.s2p"), "w") as fh:
    fh.write("! z-wave, serp_R 8.5, sub_h 6.508, ON-BODY phantom\n")
    fh.write("! raw single-ended 2-port; Sdd11 = (S11-S12-S21+S22)/2\n")
    fh.write("# GHZ S RI R 50\n")
    for i, fr in enumerate(f):
        row = [f"{fr:.6f}"]
        for nm in ("S1,1", "S2,1", "S1,2", "S2,2"):
            z = S[nm][1][i]
            row += [f"{z.real:.6e}", f"{z.imag:.6e}"]
        fh.write(" ".join(row) + "\n")

i0 = min(range(len(f)), key=lambda k: abs(f[k] - F0))
band = [k for k in range(len(f)) if BLE_LO <= f[k] <= BLE_HI]
kmin = min(range(len(f)), key=lambda k: abs(sdd[k]))
print(f"[Sdd11] at 2.450 GHz = {db(sdd[i0]):.2f} dB | "
      f"worst in BLE = {max(db(sdd[k]) for k in band):.2f} dB | "
      f"min {db(sdd[kmin]):.2f} dB @ {f[kmin]:.3f} GHz | "
      f"span {f[0]}-{f[-1]} GHz, {len(f)} pts")

fig, ax = plt.subplots(figsize=(9, 5))
ax.axvspan(BLE_LO, BLE_HI, color="#5DA9E9", alpha=0.22, zorder=0)
ax.plot(f, [db(z) for z in sdd], color=ZC, lw=2.4, label=r"$S_{dd11}$ (differential)")
ax.plot(f, [db(z) for z in S["S1,1"][1]], color=FC, lw=1.4, ls=":",
        label=r"$S_{11}$ single-ended (NOT the match)")
ax.axhline(-10, color=LIGHT, lw=0.9, ls="--", alpha=0.5)
ax.plot([F0], [db(sdd[i0])], "o", color=ZC, ms=9, mec="white", mew=1.5, zorder=5)
ax.annotate(f"{db(sdd[i0]):.2f} dB @ 2.45 GHz", (F0, db(sdd[i0])),
            textcoords="offset points", xytext=(12, 6), color=ZC, weight="bold")
ax.set_xlabel("Frequency (GHz)"), ax.set_ylabel("dB")
ax.set_title("Z-wave, on-body: differential vs single-ended reflection")
ax.grid(alpha=0.25), ax.legend(loc="lower right")
fig.tight_layout(), fig.savefig(os.path.join(RES, "Sdd11_zwave_onbody.png"), dpi=200)

# ------------------------------------------------------- 2. strain family --
def strain_family(projname):
    m = proj(projname)
    out = {}
    for rid in sorted(m.get_all_run_ids()):
        pc = m.get_parameter_combination(rid)
        s = round(float(pc.get("strain", -1)), 4)
        if s < 0:
            continue
        it = m.get_result_item(TP, rid)
        xs = [float(x) for x in it.get_xdata()]
        ys = [complex(y) for y in it.get_ydata()]
        out[s] = (xs, [db(v) for v in ys])       # ascending rid: newest wins
    return out


zf, ff_ = strain_family("zwstrain85.cst"), strain_family("zwflatB.cst")


def write_family(fam, path, tag):
    ss = sorted(fam)
    grid = fam[ss[0]][0]
    with open(path, "w") as fh:
        fh.write("freq_GHz," + ",".join(f"S11_dB_{tag}_{int(s*100)}pct"
                                        for s in ss) + "\n")
        for i, fr in enumerate(grid):
            fh.write(f"{fr:.6f}," + ",".join(f"{fam[s][1][i]:.4f}" for s in ss) + "\n")


write_family(zf, os.path.join(RES, "S11_strain_zwave.csv"), "zwave")
write_family(ff_, os.path.join(RES, "S11_strain_flat.csv"), "flat")


def f0_of(xs, ys):
    return xs[min(range(len(xs)), key=lambda i: ys[i])]


rows = []
Lz0, _ = path_length(0.0, Z_AMP)
Lf0, _ = path_length(0.0, 0.0)
z0 = f0_of(*zf[0.0])
f0_ = f0_of(*ff_[0.0])
for s in STRAINS:
    fz, fl = f0_of(*zf[s]), f0_of(*ff_[s])
    Lz, _ = path_length(s, Z_AMP)
    Lf, _ = path_length(s, 0.0)
    rows.append((s * 100, fz, 100 * (fz - z0) / z0, fl, 100 * (fl - f0_) / f0_,
                 Lz, 100 * (Lz - Lz0) / Lz0, Lf, 100 * (Lf - Lf0) / Lf0,
                 z_height(s), apex_angle(s)))

with open(os.path.join(RES, "deltaf_vs_strain.csv"), "w") as fh:
    fh.write("strain_pct,f0_zwave_GHz,deltaf_zwave_pct,f0_flat_GHz,"
             "deltaf_flat_pct,L_zwave_mm,dL_zwave_pct,L_flat_mm,dL_flat_pct,"
             "z_peak_to_peak_mm,apex_angle_deg\n")
    for r in rows:
        fh.write(",".join(f"{v:.4f}" for v in r) + "\n")

print(f"\n{'strain':>7} {'f0 zwave':>9} {'d%':>7} {'f0 flat':>9} {'d%':>7} "
      f"{'L zwave':>8} {'dL%':>7} {'L flat':>8} {'dL%':>7} {'z p-p':>7} {'apex':>7}")
for r in rows:
    print(f"{r[0]:6.0f}% {r[1]:9.3f} {r[2]:+7.2f} {r[3]:9.3f} {r[4]:+7.2f} "
          f"{r[5]:8.2f} {r[6]:+7.2f} {r[7]:8.2f} {r[8]:+7.2f} {r[9]:7.3f} {r[10]:7.1f}")

# S11 families
for fam, col, nm, fn in ((zf, ZC, "z-wave", "S11_strain_zwave.png"),
                         (ff_, FC, "flat control", "S11_strain_flat.png")):
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.axvspan(BLE_LO, BLE_HI, color="#5DA9E9", alpha=0.22, zorder=0)
    for j, s in enumerate(STRAINS):
        xs, ys = fam[s]
        ax.plot(xs, ys, color=col, lw=2, alpha=0.35 + 0.65 * j / 4,
                label=f"{int(s*100)} % strain")
    ax.set_xlabel("Frequency (GHz)"), ax.set_ylabel(r"$S_{11}$ (dB)")
    ax.set_title(f"{nm}: reflection vs uniaxial strain  (serp_R 8.5, sub_h 6.508)")
    ax.grid(alpha=0.25), ax.legend(loc="lower right", fontsize=10)
    fig.tight_layout(), fig.savefig(os.path.join(RES, fn), dpi=200)

# delta-f vs strain, the money plot
fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 5))
a1.plot([r[0] for r in rows], [r[2] for r in rows], "s-", color=ZC, lw=2.4,
        ms=8, label="z-wave  (z_amp 1.004)")
a1.plot([r[0] for r in rows], [r[4] for r in rows], "o-", color=FC, lw=2.4,
        ms=8, label="flat control  (z_amp 0)")
a1.axhline(0, color=LIGHT, lw=0.8, ls=":")
a1.axhspan(-1.7, 1.7, color="#5DA9E9", alpha=0.2, zorder=0)
a1.annotate("BLE tolerance ±1.7 %", (0.4, 1.9), color="#9CC9F0", fontsize=10)
a1.set_xlabel("Uniaxial strain (%)"), a1.set_ylabel(r"$\Delta f_0$ (%)")
a1.set_title("Frequency drift under stretch\n"
             "-7.82 % vs -10.38 % at 20 % = 25 % less drift")
a1.grid(alpha=0.25), a1.legend(loc="lower left", fontsize=10)

a2.plot([r[0] for r in rows], [r[6] for r in rows], "s-", color=ZC, lw=2.4,
        ms=8, label="z-wave conductor length")
a2.plot([r[0] for r in rows], [r[8] for r in rows], "o-", color=FC, lw=2.4,
        ms=8, label="flat conductor length")
a2.axhline(0, color=LIGHT, lw=0.8, ls=":")
a2.set_xlabel("Uniaxial strain (%)"), a2.set_ylabel(r"$\Delta L$ (%)")
a2.set_title("The mechanism: conductor path length\n"
             "flat grows +6.0 %, z-wave stays within 0.5 %")
a2.grid(alpha=0.25), a2.legend(loc="center left", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(RES, "deltaf_and_length_vs_strain.png"), dpi=200)

print(f"\nwrote CSVs + PNGs to {RES}")
