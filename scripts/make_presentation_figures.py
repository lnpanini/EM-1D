#!/usr/bin/env python3
"""Presentation figures for the 30.102 deck: dark-slide styling, PNG + CSV.

Produces ONLY the figures the solved models actually support. What is missing and
why is listed in deliverables/presentation/MISSING.md -- nothing here is invented
or extrapolated.

  F1  S11 across design iterations      (2 of 3 -- no concentric-ring CST model)
  F2  Delta-f vs strain, z-wave vs flat control
  F3  Z-wave S_dd11 baseline            (ON-BODY -- no free-space model exists)
  F4  Z-wave S11 strain family

Every plot: dashed -10 dB line, BLE 2.400-2.4835 shaded, 2.45 GHz marker.

Usage:  python scripts/make_presentation_figures.py [outdir]
"""

from __future__ import annotations

import csv
import math
import os
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.results as cr  # noqa: E402

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "deliverables", "presentation")
os.makedirs(OUT, exist_ok=True)

SP = "1D Results\\S-Parameters\\"
BLE_LO, BLE_HI = 2.400, 2.4835
F_MARK = 2.450

FG = "#e8eef5"
C_ZWAVE = "#f5c518"
C_SERP = "#4dd0e1"
C_CONC = "#b39ddb"
C_BODY = "#ff8a65"
C_BLE = "#7CFC98"

plt.rcParams.update({
    "figure.facecolor": "none", "axes.facecolor": "none",
    "savefig.facecolor": "none", "savefig.transparent": True,
    "text.color": FG, "axes.labelcolor": FG, "axes.edgecolor": FG,
    "xtick.color": FG, "ytick.color": FG,
    "axes.labelsize": 13, "xtick.labelsize": 11, "ytick.labelsize": 11,
    "axes.titlesize": 14, "legend.fontsize": 11,
    "grid.color": FG, "grid.alpha": 0.25, "figure.dpi": 200,
})


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -120.0


def _mod(proj):
    return cr.ProjectFile(os.path.join(ROOT, "work", proj),
                          allow_interactive=True).get_3d()


def sdd11(proj, **want):
    """Differential S_dd11 for the run matching `want` (never max(run_id))."""
    mod = _mod(proj)
    for rid in sorted(mod.get_all_run_ids()):
        try:
            pc = mod.get_parameter_combination(rid)
        except Exception:
            continue
        if any(pc.get(k) is None or abs(float(pc[k]) - v) > 1e-3
               for k, v in want.items()):
            continue
        try:
            S = {}
            for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
                it = mod.get_result_item(SP + nm, rid)
                xs = [float(x) for x in it.get_xdata()]
                if not xs:
                    raise RuntimeError("empty")
                S[nm] = (xs, [complex(y) for y in it.get_ydata()])
        except Exception:
            continue
        f = S["S1,1"][0]
        sdd = [(a - b - c + d) / 2 for a, b, c, d in
               zip(S["S1,1"][1], S["S1,2"][1], S["S2,1"][1], S["S2,2"][1])]
        return f, [db(z) for z in sdd]
    raise SystemExit(f"{proj}: no run matching {want}")


def s11_by_strain(proj):
    """{strain: (f, dB)} for a strain-sweep project, newest run per strain."""
    mod = _mod(proj)
    out = {}
    for rid in sorted(mod.get_all_run_ids()):
        try:
            pc = mod.get_parameter_combination(rid)
            s = float(pc["strain"])
            it = mod.get_result_item(SP + "S1,1", rid)
            f = [float(x) for x in it.get_xdata()]
            y = [db(complex(v)) for v in it.get_ydata()]
            if f:
                out[s] = (f, y)
        except Exception:
            continue
    return out


def dip(f, y):
    """Deepest interior minimum -- the resonance."""
    cand = [(f[i], y[i]) for i in range(1, len(f) - 1)
            if y[i] <= y[i - 1] and y[i] < y[i + 1] and y[i] < -3]
    return min(cand, key=lambda t: t[1]) if cand else (f[y.index(min(y))], min(y))


def dress(ax, xlo=1.5, xhi=4.0, ylab="$S_{dd11}$ (dB)"):
    ax.set_xlim(xlo, xhi)
    ax.axvspan(BLE_LO, BLE_HI, color=C_BLE, alpha=0.15, zorder=0)
    ax.axhline(-10, color=FG, lw=1.0, ls="--", alpha=0.7, zorder=1)
    ax.axvline(F_MARK, color=FG, lw=0.9, ls=":", alpha=0.6, zorder=1)
    ax.set_xlabel("Frequency (GHz)")
    ax.set_ylabel(ylab)
    ax.grid(True)
    for s in ax.spines.values():
        s.set_alpha(0.5)


def write_csv(name, header, rows):
    p = os.path.join(OUT, name)
    with open(p, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print(f"  csv  {name}  ({len(rows)} rows)")


def save(fig, name):
    p = os.path.join(OUT, name)
    fig.savefig(p, dpi=200, transparent=True, bbox_inches="tight")
    plt.close(fig)
    print(f"  png  {name}")


# ---------------------------------------------------------------- F1 --------
def f1():
    fz, yz = sdd11("zwave-feed3.cst", serp_R=8.5, sub_h=6.508)
    fs, ys = sdd11("param-sim.cst", serp_R=8.95)
    fig, ax = plt.subplots(figsize=(10, 5.6))
    dress(ax)
    for f, y, c, lab in ((fs, ys, C_SERP, "Iteration 2 — flat serpentine"),
                         (fz, yz, C_ZWAVE, "Iteration 3 — z-wave (final)")):
        d = dip(f, y)
        ax.plot(f, y, color=c, lw=2.2, label=f"{lab}   $f_0$ = {d[0]:.3f} GHz")
        ax.plot([d[0]], [d[1]], "o", color=c, ms=7, mec=FG, mew=1.0, zorder=5)
    ax.set_title("Differential match across design iterations (on-body)")
    ax.legend(loc="lower right", framealpha=0.0)
    ax.text(0.015, 0.04, "Iteration 1 (concentric circles) was never built in CST\n"
            "— no simulation data exists for it",
            transform=ax.transAxes, fontsize=9, color=C_CONC, alpha=0.9)
    save(fig, "F1_S11_iterations.png")
    n = min(len(fs), len(fz))
    write_csv("F1_S11_iterations.csv",
              ["freq_GHz_serpentine", "Sdd11_dB_serpentine",
               "freq_GHz_zwave", "Sdd11_dB_zwave"],
              [[fs[i], ys[i], fz[i], yz[i]] for i in range(n)])


# ---------------------------------------------------------------- F2 --------
def f2():
    zw, fl = s11_by_strain("zwstrain85.cst"), s11_by_strain("zwflatB.cst")
    it2 = s11_by_strain("flex-strain.cst")   # the tuned iteration-2 serpentine
    fig, ax = plt.subplots(figsize=(9.4, 5.8))
    rows = []
    for data, c, lab in ((it2, C_CONC, "Iteration-2 serpentine (own design point)"),
                         (fl, C_SERP, "Flat control ($z_{amp}$ = 0, matched)"),
                         (zw, C_ZWAVE, "Z-wave ($z_{amp}$ = 1.004 mm)")):
        ss = sorted(data)
        f0 = dip(*data[ss[0]])[0]
        xs = [100 * s for s in ss]
        ys = [100 * (dip(*data[s])[0] - f0) / f0 for s in ss]
        ax.plot(xs, ys, "o-", color=c, lw=2.4, ms=8, mec=FG, mew=1.0, label=lab)
        ax.annotate(f"{ys[-1]:+.2f} %", (xs[-1], ys[-1]),
                    textcoords="offset points", xytext=(-12, -18),
                    color=c, fontsize=12, weight="bold")
        for s, x, y in zip(ss, xs, ys):
            rows.append([lab.split(" (")[0], 100 * s, dip(*data[s])[0], y])
    ax.axhline(0, color=FG, lw=0.9, ls=":", alpha=0.6)
    ax.set_xlabel("Applied uniaxial strain (%)")
    ax.set_ylabel("Resonance drift $\\Delta f / f_0$ (%)")
    ax.set_title("Frequency drift under stretch — matched geometry,\n"
                 "identical except $z_{amp}$", fontsize=13)
    ax.grid(True)
    ax.legend(loc="lower left", framealpha=0.0)
    for s in ax.spines.values():
        s.set_alpha(0.5)
    save(fig, "F2_deltaf_vs_strain_geometries.png")
    write_csv("F2_deltaf_vs_strain_geometries.csv",
              ["geometry", "strain_pct", "f0_GHz", "delta_f_pct"], rows)


# ---------------------------------------------------------------- F3 --------
def f3():
    f, y = sdd11("zwave-feed3.cst", serp_R=8.5, sub_h=6.508)
    fig, ax = plt.subplots(figsize=(10, 5.6))
    dress(ax)
    ax.plot(f, y, color=C_ZWAVE, lw=2.4, label="Z-wave, on-body, full SSMA feed")
    i = min(range(len(f)), key=lambda k: abs(f[k] - F_MARK))
    ax.plot([f[i]], [y[i]], "o", color=C_ZWAVE, ms=9, mec=FG, mew=1.2, zorder=5)
    ax.annotate(f"{y[i]:.2f} dB @ 2.45 GHz", (f[i], y[i]),
                textcoords="offset points", xytext=(12, -6),
                color=C_ZWAVE, fontsize=12, weight="bold")
    band = [k for k in range(len(f)) if BLE_LO <= f[k] <= BLE_HI]
    ax.set_title("Z-wave differential match — no $-10$ dB crossing anywhere\n"
                 f"worst across BLE: {max(y[k] for k in band):.2f} dB",
                 fontsize=13)
    ax.legend(loc="lower right", framealpha=0.0)
    save(fig, "F3_S11_zwave_flat.png")
    write_csv("F3_S11_zwave_flat.csv", ["freq_GHz", "Sdd11_dB"],
              [[f[i], y[i]] for i in range(len(f))])


# ---------------------------------------------------------------- F4 --------
def f4():
    zw = s11_by_strain("zwstrain85.cst")
    fig, ax = plt.subplots(figsize=(10, 5.6))
    dress(ax, xlo=1.5, xhi=3.2, ylab="$S_{11}$ (dB), delta-gap port")
    ss = sorted(zw)
    rows = []
    for j, s in enumerate(ss):
        f, y = zw[s]
        shade = 0.35 + 0.65 * j / max(len(ss) - 1, 1)
        d = dip(f, y)
        ax.plot(f, y, color=C_ZWAVE, alpha=shade, lw=2.2,
                label=f"{100*s:.0f} % strain   $f_0$ = {d[0]:.3f} GHz")
        rows += [[100 * s, f[i], y[i]] for i in range(len(f))]
    ax.set_title("Z-wave under stretch — bare loop, delta-gap feed\n"
                 "(not tuned to 2.45; the % shift is the result)", fontsize=13)
    ax.legend(loc="lower left", framealpha=0.0, fontsize=10)
    save(fig, "F4_S11_zwave_strain.png")
    write_csv("F4_S11_zwave_strain.csv", ["strain_pct", "freq_GHz", "S11_dB"], rows)


# --------------------------------------------------------------- F15 -------
def f15():
    """Smith chart of Zdiff, from the same run as F3. No solve needed."""
    mod = _mod("zwave-feed3.cst")
    for rid in sorted(mod.get_all_run_ids()):
        pc = mod.get_parameter_combination(rid)
        if pc.get("serp_R") is None or abs(float(pc["serp_R"]) - 8.5) > 1e-3:
            continue
        if abs(float(pc["sub_h"]) - 6.508) > 1e-3:
            continue
        S = {}
        for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
            it = mod.get_result_item(SP + nm, rid)
            S[nm] = ([float(x) for x in it.get_xdata()],
                     [complex(y) for y in it.get_ydata()])
        break
    else:
        raise SystemExit("no matching run")
    f = S["S1,1"][0]
    sdd = [(a - b - c + d) / 2 for a, b, c, d in
           zip(S["S1,1"][1], S["S1,2"][1], S["S2,1"][1], S["S2,2"][1])]

    fig, ax = plt.subplots(figsize=(7.2, 7.2))
    th = [i * math.pi / 180 for i in range(361)]
    ax.plot([math.cos(t) for t in th], [math.sin(t) for t in th],
            color=FG, lw=1.2, alpha=0.8)
    for vswr in (2.0, 3.0):
        r = (vswr - 1) / (vswr + 1)
        ax.plot([r * math.cos(t) for t in th], [r * math.sin(t) for t in th],
                color=FG, lw=0.9, ls="--", alpha=0.45)
        ax.annotate(f"VSWR {vswr:.0f}", (0, r), color=FG, fontsize=9,
                    alpha=0.6, ha="center", va="bottom")
    ax.axhline(0, color=FG, lw=0.8, alpha=0.35)
    ax.plot([z.real for z in sdd], [z.imag for z in sdd],
            color=C_ZWAVE, lw=2.2, label="Z-wave, 1.5–3.2 GHz")
    i = min(range(len(f)), key=lambda k: abs(f[k] - F_MARK))
    ax.plot([sdd[i].real], [sdd[i].imag], "o", color=C_ZWAVE, ms=11,
            mec=FG, mew=1.4, zorder=5)
    z = 100 * (1 + sdd[i]) / (1 - sdd[i])
    ax.annotate(f"2.45 GHz\n{z.real:.0f} {'+' if z.imag>=0 else '−'} "
                f"{abs(z.imag):.0f}j Ω", (sdd[i].real, sdd[i].imag),
                textcoords="offset points", xytext=(14, 4), color=C_ZWAVE,
                fontsize=12, weight="bold")
    ax.set_aspect("equal")
    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-1.15, 1.15)
    ax.axis("off")
    ax.set_title("Differential reflection locus, 100 Ω reference\n"
                 "the loop's closed impedance path", fontsize=13)
    ax.legend(loc="lower left", framealpha=0.0)
    save(fig, "F15_smith_zwave.png")
    write_csv("F15_smith_zwave.csv",
              ["freq_GHz", "Sdd11_real", "Sdd11_imag", "Zdiff_real", "Zdiff_imag"],
              [[f[k], sdd[k].real, sdd[k].imag,
                (100 * (1 + sdd[k]) / (1 - sdd[k])).real,
                (100 * (1 + sdd[k]) / (1 - sdd[k])).imag] for k in range(len(f))])


# --------------------------------------------------------------- F17 -------
def f17():
    """Where the accepted power goes at 2.44 GHz -- the loss budget."""
    mod = _mod("zwave-feed3.cst")
    exc = "1D Results\\Power\\Excitation [1]\\"

    def at(path, rid=10):
        it = mod.get_result_item(exc + path, rid)
        xs = [float(x) for x in it.get_xdata()]
        ys = [abs(complex(y)) for y in it.get_ydata()]
        k = min(range(len(xs)), key=lambda i: abs(xs[i] - 2.44))
        return ys[k]

    acc = at("Power Accepted")
    parts = [
        ("Radiated", at("Power Radiated"), C_ZWAVE),
        ("Muscle", at("Loss per Material\\Volume loss in Muscle"), C_BODY),
        ("Skin", at("Loss per Material\\Volume loss in Skin"), "#ffab91"),
        ("Fat", at("Loss per Material\\Volume loss in Fat"), "#ffccbc"),
        ("Ecoflex (tan δ)", at("Loss per Material\\Volume loss in Substrate Material"), C_SERP),
        ("EGaIn conductor", at("Loss per Material\\Metal loss in EGaIn"), C_CONC),
    ]
    fig, ax = plt.subplots(figsize=(11, 3.8))
    left = 0.0
    for lab, v, c in parts:
        pct = 100 * v / acc
        ax.barh([0], [pct], left=left, color=c, edgecolor="none", height=0.5)
        mid = left + pct / 2
        if pct >= 12:                      # roomy: label inside the block
            ax.text(mid, 0, f"{lab}\n{pct:.1f} %", ha="center", va="center",
                    fontsize=11, color="#10243a", weight="bold")
        else:                              # narrow: label below, with a leader
            ax.annotate(f"{lab}\n{pct:.1f} %", xy=(mid, -0.26),
                        xytext=(mid, -0.60), ha="center", va="top",
                        fontsize=10, color=c, weight="bold",
                        arrowprops=dict(arrowstyle="-", color=c, lw=1.0))
        left += pct
    ax.set_xlim(0, 100)
    ax.set_ylim(-0.95, 0.40)
    ax.set_yticks([])
    ax.set_xlabel("Share of accepted power (%)")
    ax.set_title("Where the power goes at 2.44 GHz — only 5.2 % radiates.\n"
                 "Tissue absorbs 66.8 %; Ecoflex loses 5× more than the EGaIn.",
                 fontsize=13)
    ax.grid(True, axis="x")
    for s in ax.spines.values():
        s.set_alpha(0.5)
    save(fig, "F17_loss_budget.png")
    write_csv("F17_loss_budget.csv", ["channel", "watts", "pct_of_accepted"],
              [[lab, v, 100 * v / acc] for lab, v, _ in parts])


# --------------------------------------------------------------- F13 -------
def f13():
    """Free space vs on-body -- the wearable-antenna trade, in one figure."""
    ff, yf = sdd11("zwfree.cst", serp_R=8.5, sub_h=6.508)
    fb, yb = sdd11("zwave-feed3.cst", serp_R=8.5, sub_h=6.508)
    fig, ax = plt.subplots(figsize=(10, 5.6))
    dress(ax)
    for f, y, c, lab in ((ff, yf, C_ZWAVE, "Free space"),
                         (fb, yb, C_BODY, "On body (skin/fat/muscle)")):
        i = min(range(len(f)), key=lambda k: abs(f[k] - F_MARK))
        ax.plot(f, y, color=c, lw=2.3, label=f"{lab}   {y[i]:.2f} dB @ 2.45 GHz")
        ax.plot([f[i]], [y[i]], "o", color=c, ms=8, mec=FG, mew=1.1, zorder=5)
    ax.set_title("Body loading IMPROVES the match while destroying efficiency\n"
                 "tissue loss adds series resistance", fontsize=13)
    ax.legend(loc="lower right", framealpha=0.0)
    save(fig, "F13_S11_freespace_vs_onbody.png")
    n = min(len(ff), len(fb))
    write_csv("F13_S11_freespace_vs_onbody.csv",
              ["freq_GHz", "Sdd11_dB_freespace", "Sdd11_dB_onbody"],
              [[ff[i], yf[i], yb[i]] for i in range(n)])


# --------------------------------------------------------------- F14 -------
def f14():
    """Radiation efficiency, free space vs on body, at 2.44 GHz."""
    def eff(proj, rid):
        it = _mod(proj).get_result_item(
            "1D Results\\Efficiencies\\Rad. Efficiency [1]", rid)
        return 100 * abs(complex(list(it.get_ydata())[0]))

    free = eff("zwfree.cst", 0)
    body = eff("zwave-feed3.cst", 10)
    fig, ax = plt.subplots(figsize=(7.6, 5.2))
    bars = ax.bar(["Free space", "On body"], [free, body],
                  color=[C_ZWAVE, C_BODY], width=0.55)
    for b, v in zip(bars, (free, body)):
        ax.text(b.get_x() + b.get_width() / 2, v + 1.6, f"{v:.1f} %",
                ha="center", fontsize=15, weight="bold",
                color=C_ZWAVE if v == free else C_BODY)
    ax.annotate("", xy=(1, body), xytext=(1, free),
                arrowprops=dict(arrowstyle="<->", color=FG, lw=1.6))
    ax.text(1.06, (free + body) / 2, f"{free/body:.1f}× drop\n"
            f"{free-body:.1f} points absorbed\nby tissue",
            va="center", fontsize=11.5, color=FG)
    ax.set_ylabel("Radiation efficiency at 2.44 GHz (%)")
    ax.set_ylim(0, max(free, body) * 1.28)
    ax.set_title("What the body costs", fontsize=14)
    ax.grid(True, axis="y")
    for s in ax.spines.values():
        s.set_alpha(0.5)
    save(fig, "F14_efficiency_onbody.png")
    write_csv("F14_efficiency_onbody.csv",
              ["case", "radiation_efficiency_pct_at_2p44GHz"],
              [["free space", free], ["on body", body]])


# --------------------------------------------------------------- F12 -------
def f12():
    """Body-model setup diagram, drawn from the macro's own parameters."""
    sub_h, z_amp, gap = 6.508, 1.004, 1.0
    skin_t, fat_t, musc_show = 2.0, 5.0, 12.0
    half_w = 30.0
    z_sub_t, z_sub_b = sub_h / 2, -sub_h / 2
    z_sk_t = z_sub_b - gap
    z_sk_b, z_ft_b = z_sk_t - skin_t, z_sk_t - skin_t - fat_t
    z_ms_b = z_ft_b - musc_show

    fig, ax = plt.subplots(figsize=(11, 6.4))
    layers = [
        ("Muscle", z_ms_b, z_ft_b, "#c0564a", "ε 52.7   σ 1.74 S/m   70 mm"),
        ("Fat", z_ft_b, z_sk_b, "#f0d9a8", "ε 5.28   σ 0.102 S/m   5 mm"),
        ("Skin", z_sk_b, z_sk_t, "#e2a07a", "ε 38.0   σ 1.46 S/m   2 mm"),
    ]
    for nm, zb, zt, c, txt in layers:
        ax.add_patch(plt.Rectangle((-half_w, zb), 2 * half_w, zt - zb,
                                   facecolor=c, alpha=0.75, edgecolor=FG, lw=0.8))
        ax.text(-half_w + 1.5, (zb + zt) / 2, f"{nm}", fontsize=13,
                weight="bold", color="#10243a", va="center")
        ax.text(half_w - 1.5, (zb + zt) / 2, txt, fontsize=10.5,
                color="#10243a", va="center", ha="right")
    ax.add_patch(plt.Rectangle((-half_w, z_sub_b), 2 * half_w, sub_h,
                               facecolor="#f7c9b8", alpha=0.55,
                               edgecolor=FG, lw=1.0))
    ax.text(-half_w + 1.5, 0, "Ecoflex substrate", fontsize=13, weight="bold",
            color="#10243a", va="center")
    ax.text(half_w - 1.5, 0, "ε 2.6   tan δ 0.03   6.508 mm", fontsize=10.5,
            color="#10243a", va="center", ha="right")

    xs = [-20.4 / 2 + i * 20.4 / 200 for i in range(201)]
    zc = [z_amp * math.cos(2 * math.pi * 3 * (x + 10.2) / 20.4) for x in xs]
    ax.plot(xs, zc, color=C_ZWAVE, lw=3.4, solid_capstyle="round",
            label="EGaIn channel, Ø0.5 mm (z-wave, ±1.004 mm)")

    # dimensions live OUTSIDE the slab so they cannot collide with layer text
    xg = -half_w - 5
    ax.annotate("", xy=(xg, z_sub_b), xytext=(xg, z_sk_t),
                arrowprops=dict(arrowstyle="<->", color=FG, lw=1.5))
    ax.text(xg - 1.2, (z_sub_b + z_sk_t) / 2, "1.0 mm\nair gap", fontsize=10.5,
            color=FG, va="center", ha="right")
    xc = half_w + 5
    ax.annotate("", xy=(xc, 0), xytext=(xc, z_sk_t),
                arrowprops=dict(arrowstyle="<->", color=C_ZWAVE, lw=1.5))
    ax.text(xc + 1.2, z_sk_t / 2, "conductor → skin\n4.25 mm", fontsize=10.5,
            color=C_ZWAVE, va="center", ha="left")

    ax.set_xlim(-half_w - 18, half_w + 26)
    ax.set_ylim(z_ms_b - 1, z_sub_t + 5)
    ax.set_xlabel("x (mm)   —   phantom is 110 × 110 mm in plan")
    ax.set_ylabel("z (mm)")
    ax.set_title("On-body simulation setup — 3-layer flat phantom\n"
                 "tissue values IT'IS/Gabriel at 2.45 GHz; open boundaries, "
                 "λ/8 background", fontsize=13)
    ax.legend(loc="upper left", framealpha=0.0, fontsize=10.5)
    ax.grid(True, alpha=0.15)
    for s in ax.spines.values():
        s.set_alpha(0.5)
    ax.text(0, z_ms_b - 0.4, "muscle continues to 70 mm (truncated for clarity)",
            fontsize=9.5, color=FG, alpha=0.75, ha="center", va="top")
    save(fig, "F12_body_setup.png")


# --------------------------------------------------------------- F18 -------
def f18():
    """Simulated vs measured -- like-for-like, single-ended, free space."""
    mod = _mod("zwfree.cst")
    it = mod.get_result_item(SP + "S1,1", 0)
    f = [float(x) for x in it.get_xdata()]
    y = [db(complex(v)) for v in it.get_ydata()]

    M_F0, M_S11, M_LO, M_HI, M_AT245 = 2.527, -16.2, 2.438, 3.132, -11.1

    fig, ax = plt.subplots(figsize=(10, 5.8))
    dress(ax, ylab="$S_{11}$ (dB), single-ended, 50 Ω")
    ax.plot(f, y, color=C_ZWAVE, lw=2.3, label="Simulated — free space, port 1")
    ax.axvspan(M_LO, M_HI, color=C_BODY, alpha=0.13, zorder=0)
    ax.plot([M_F0], [M_S11], "v", color=C_BODY, ms=14, mec=FG, mew=1.2,
            zorder=6, label=f"Measured $f_0$ = {M_F0} GHz, {M_S11} dB")
    ax.plot([2.450], [M_AT245], "s", color=C_BODY, ms=10, mec=FG, mew=1.1,
            zorder=6, label=f"Measured @ 2.450 GHz = {M_AT245} dB")
    ax.annotate(f"measured −10 dB band  {M_LO}–{M_HI} GHz",
                xy=((M_LO + M_HI) / 2, -1.4), color=C_BODY, fontsize=10.5,
                ha="center", weight="bold")
    i = min(range(len(f)), key=lambda k: abs(f[k] - 2.450))
    ax.plot([f[i]], [y[i]], "o", color=C_ZWAVE, ms=9, mec=FG, mew=1.2, zorder=6)
    ks = min(range(len(f)), key=lambda k: y[k])
    ax.annotate(f"simulated $f_0$ = {f[ks]:.3f} GHz\n"
                f"{f[ks]-M_F0:+.3f} GHz vs measured",
                xy=(f[ks], y[ks]), textcoords="offset points", xytext=(10, 14),
                color=C_ZWAVE, fontsize=11, weight="bold")
    ax.set_ylim(min(y) - 4, 0)
    ax.set_title("Simulated vs measured — the model resonates "
                 f"{abs(f[ks]-M_F0)*1000:.0f} MHz LOW\n"
                 "and the two are not yet like-for-like — see caveats",
                 fontsize=13)
    ax.legend(loc="lower right", framealpha=0.0, fontsize=10)
    print(f"      F18: simulated free-space single-ended f0 = {f[ks]:.3f} GHz "
          f"({y[ks]:.1f} dB); measured {M_F0} GHz ({M_S11} dB); "
          f"delta {1000*(f[ks]-M_F0):+.0f} MHz")
    save(fig, "F18_simulated_vs_measured.png")
    write_csv("F18_simulated_vs_measured.csv",
              ["freq_GHz", "S11_dB_simulated_freespace_singleended"],
              [[f[k], y[k]] for k in range(len(f))])


# ---------------------------------------------------------------- F7 -------
def f7():
    """Efficiency vs frequency, on body. Needs the 15-monitor re-solve.

    CST's "total efficiency" is for SINGLE-PORT excitation with the other port
    terminated, which is not how this antenna is driven. The meaningful curve for
    a differential drive is rad_eff x (1 - |Sdd11|^2), derived here and labelled
    as derived.
    """
    mod = _mod("zwfinal-fab.cst")

    def eff(nm):
        it = mod.get_result_item("1D Results\\Efficiencies\\" + nm, 0)
        return [(float(a), 100 * abs(complex(b)))
                for a, b in zip(it.get_xdata(), it.get_ydata())]

    rad, tot = eff("Rad. Efficiency [1]"), eff("Tot. Efficiency [1]")
    S = {}
    for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
        it = mod.get_result_item(SP + nm, 0)
        S[nm] = ([float(x) for x in it.get_xdata()],
                 [complex(y) for y in it.get_ydata()])
    fs = S["S1,1"][0]
    sdd = [(a - b - c + d) / 2 for a, b, c, d in
           zip(S["S1,1"][1], S["S1,2"][1], S["S2,1"][1], S["S2,2"][1])]

    def deliv(fq, r):
        k = min(range(len(fs)), key=lambda i: abs(fs[i] - fq))
        return r * (1 - abs(sdd[k]) ** 2)

    dl = [(fq, deliv(fq, r)) for fq, r in rad]

    fig, ax = plt.subplots(figsize=(10, 5.8))
    ax.axvspan(BLE_LO, BLE_HI, color=C_BLE, alpha=0.15, zorder=0)
    ax.axvline(F_MARK, color=FG, lw=0.9, ls=":", alpha=0.6)
    series = [(rad, C_ZWAVE, "-", "Radiation efficiency"),
              (dl, C_BODY, "-", "Delivered, differential (derived)"),
              (tot, C_SERP, "--", "CST total efficiency (single-port drive)")]
    for data, c, ls, lab in series:
        xs = [p[0] for p in data]
        ys = [p[1] for p in data]
        ax.plot(xs, ys, ls, color=c, lw=2.3, marker="o", ms=5, label=lab)
        k = min(range(len(xs)), key=lambda i: abs(xs[i] - 2.44))
        ax.annotate(f"{ys[k]:.2f} %", (xs[k], ys[k]), textcoords="offset points",
                    xytext=(8, 8), color=c, fontsize=11, weight="bold")
    ax.set_xlim(1.8, 3.2)
    ax.set_ylim(0, max(p[1] for p in rad) * 1.25)
    ax.set_xlabel("Frequency (GHz)")
    ax.set_ylabel("Efficiency (%)")
    ax.set_title("Efficiency vs frequency, ON BODY — falls monotonically\n"
                 "tissue absorption rises with frequency", fontsize=13)
    ax.grid(True)
    ax.legend(loc="upper right", framealpha=0.0, fontsize=10.5)
    for s in ax.spines.values():
        s.set_alpha(0.5)
    save(fig, "F7_efficiency_vs_freq.png")
    write_csv("F7_efficiency_vs_freq.csv",
              ["freq_GHz", "radiation_eff_pct", "delivered_diff_pct_derived",
               "cst_total_eff_pct_singleport"],
              [[rad[i][0], rad[i][1], dl[i][1], tot[i][1]]
               for i in range(len(rad))])


# --------------------------------------------------------------- F19 -------
def se_s11(proj, rid=0):
    """SINGLE-ENDED S11 on port 1 -- what a one-port VNA measurement sees."""
    it = _mod(proj).get_result_item(SP + "S1,1", rid)
    return ([float(x) for x in it.get_xdata()],
            [db(complex(v)) for v in it.get_ydata()])


def f19():
    """Measured vs simulated, SINGLE-ENDED S11 -- like-for-like at last."""
    def load(name):
        p = os.path.join(OUT, name)
        if not os.path.exists(p):
            raise SystemExit(f"missing {name} -- run scripts/parse_zvh_set.py")
        with open(p, encoding="utf-8") as fh:
            rows = list(csv.reader(fh))[1:]
        return [float(r[0]) for r in rows], [float(r[1]) for r in rows]

    fb_, yb_ = load("measured_S11_best.csv")      # 19018.set, 06:33
    fd_, yd_ = load("measured_S11.csv")           # harish003.set, 13:25
    ffree, yfree = se_s11("zwfree.cst")
    fbody, ybody = se_s11("zwfinal-fab.cst")

    C_BEST, C_DEG = "#7CFC98", C_BODY

    fig, ax = plt.subplots(figsize=(11, 6.2))
    dress(ax, xlo=1.5, xhi=4.0, ylab="$S_{11}$ (dB), single-ended, 50 Ω")
    ax.plot(fb_, yb_, color=C_BEST, lw=2.6,
            label="MEASURED — best, 06:33 (before degradation)")
    ax.plot(fd_, yd_, color=C_DEG, lw=2.4,
            label="MEASURED — later, 13:25 (degraded)")
    ax.plot(ffree, yfree, color=C_ZWAVE, lw=2.2, label="Simulated — free space")
    ax.plot(fbody, ybody, color=C_SERP, lw=2.0, ls="--",
            label="Simulated — on body")

    for f, y, c, dy in ((fb_, yb_, C_BEST, -34), (fd_, yd_, C_DEG, 12)):
        k = min(range(len(f)), key=lambda i: y[i])
        ax.plot([f[k]], [y[k]], "v", color=c, ms=13, mec=FG, mew=1.2, zorder=6)
        ax.annotate(f"{f[k]:.3f} GHz\n{y[k]:.2f} dB", (f[k], y[k]),
                    textcoords="offset points", xytext=(10, dy),
                    color=c, fontsize=11, weight="bold")
    for f, y, c in ((ffree, yfree, C_ZWAVE), (fbody, ybody, C_SERP)):
        k = min(range(len(f)), key=lambda i: y[i])
        ax.annotate(f"{f[k]:.3f} GHz", (f[k], y[k]), textcoords="offset points",
                    xytext=(6, 8), color=c, fontsize=10.5, weight="bold")

    kb = min(range(len(fb_)), key=lambda i: yb_[i])
    kd = min(range(len(fd_)), key=lambda i: yd_[i])
    ax.annotate("", xy=(fd_[kd], -3.0), xytext=(fb_[kb], -3.0),
                arrowprops=dict(arrowstyle="->", color=FG, lw=1.6))
    ax.text((fb_[kb] + fd_[kd]) / 2, -2.3,
            f"degradation: {1000*(fd_[kd]-fb_[kb]):+.0f} MHz, "
            f"{yd_[kd]-yb_[kb]:+.1f} dB", ha="center", fontsize=10.5, color=FG)

    ax.set_ylim(min(min(yfree), min(ybody), min(yb_)) - 3, 0)
    ax.set_title("Single-ended $S_{11}$ — two measurements and the model\n"
                 "the prototype drifted UP and lost match over one day; "
                 "the model sits below both", fontsize=12.5)
    ax.legend(loc="lower right", framealpha=0.0, fontsize=10)
    save(fig, "F19_S11_singleended_meas_vs_sim.png")

    n = max(len(fb_), len(fd_), len(ffree))
    def g(a, i):
        return a[i] if i < len(a) else ""
    write_csv("F19_S11_singleended_meas_vs_sim.csv",
              ["freq_GHz_meas_best", "S11_dB_meas_best",
               "freq_GHz_meas_degraded", "S11_dB_meas_degraded",
               "freq_GHz_sim", "S11_dB_sim_freespace", "S11_dB_sim_onbody"],
              [[g(fb_, i), g(yb_, i), g(fd_, i), g(yd_, i),
                g(ffree, i), g(yfree, i), g(ybody, i)] for i in range(n)])
    print(f"      F19: best {fb_[kb]:.4f} GHz ({yb_[kb]:.2f} dB) -> "
          f"degraded {fd_[kd]:.4f} GHz ({yd_[kd]:.2f} dB) | "
          f"sim free {ffree[min(range(len(yfree)), key=lambda i: yfree[i])]:.3f}")


# --------------------------------------------------------------- F20 -------
def f20():
    """Side profile, unstretched vs stretched -- the length-conservation mechanism.

    Geometry is the macro's own curve (see scripts/path_length_report.py), under
    the same affine incompressible transform the CST strain macro applies:
    lam_x = 1+e on x, lam_t = 1/sqrt(1+e) on y and z.
    """
    R, AMP, SKEW, NU, GAP = 8.5, 1.7, 0.425, 12, 1.0
    Z_AMP, Z_CYC = 1.004, 24
    STRAIN = 0.20
    M = 6000

    def curve(e):
        lx, lt = 1 + e, 1 / math.sqrt(1 + e)
        s0 = R + AMP + 2 * SKEW * NU
        dg = min(GAP / s0, 0.6)
        tA, tB = dg / 2, 2 * math.pi - dg / 2
        pts = []
        for i in range(M + 1):
            t = tA + (tB - tA) * i / M
            uu = R + AMP * math.sin(NU * t + math.pi / 2)
            vv = SKEW * math.sin(2 * NU * t + math.pi)
            ct, st = math.cos(t), math.sin(t)
            pts.append((lx * (uu * ct + vv * st), lt * (uu * st - vv * ct),
                        lt * Z_AMP * math.cos(Z_CYC * t)))
        return pts

    def unroll(pts):
        """z against cumulative IN-PLANE arc length, and the two lengths."""
        s, l3, out = 0.0, 0.0, []
        for i, (x, y, z) in enumerate(pts):
            if i:
                px, py, pz = pts[i - 1]
                s += math.dist((x, y), (px, py))
                l3 += math.dist((x, y, z), (px, py, pz))
            out.append((s, z))
        return out, s, l3

    a, sa, la = unroll(curve(0.0))
    b, sb, lb = unroll(curve(STRAIN))
    za, zb = Z_AMP, Z_AMP / math.sqrt(1 + STRAIN)

    def max_slope_deg(prof):
        m = 0.0
        for i in range(1, len(prof)):
            ds = prof[i][0] - prof[i - 1][0]
            if ds > 1e-9:
                m = max(m, abs((prof[i][1] - prof[i - 1][1]) / ds))
        return math.degrees(math.atan(m))

    fig = plt.figure(figsize=(12.4, 7.6))
    gs = fig.add_gridspec(2, 1, height_ratios=[1.35, 1.0], hspace=0.42)

    # --- top: three periods, unrolled, both states over each other ---
    ax = fig.add_subplot(gs[0])
    span = 3 * sa / Z_CYC
    for prof, c, lab in ((a, C_ZWAVE, "0 % strain"),
                         (b, C_BODY, f"{STRAIN*100:.0f} % strain")):
        xs = [p[0] for p in prof if p[0] <= span * (1 + STRAIN)]
        ys = [p[1] for p in prof if p[0] <= span * (1 + STRAIN)]
        ax.plot(xs, ys, color=c, lw=3.0, label=lab, solid_capstyle="round")
    ax.axhline(0, color=FG, lw=0.8, ls=":", alpha=0.5)

    x0, x1 = 0.62, span * 0.52
    ax.annotate("", xy=(x0, za), xytext=(x0, -za),
                arrowprops=dict(arrowstyle="<->", color=C_ZWAVE, lw=1.8))
    ax.text(x0, 1.24, f"{2*za:.3f} mm p–p", color=C_ZWAVE, fontsize=11.5,
            ha="center", va="bottom", weight="bold")
    ax.annotate("", xy=(x1, zb), xytext=(x1, -zb),
                arrowprops=dict(arrowstyle="<->", color=C_BODY, lw=1.8))
    ax.text(x1, 1.24, f"{2*zb:.3f} mm p–p  ({100*(zb/za-1):+.1f} %)",
            color=C_BODY, fontsize=11.5, ha="center", va="bottom", weight="bold")

    ax.set_xlabel("Position along the in-plane path (mm)")
    ax.set_ylabel("z (mm)")
    ax.set_xlim(0, span * (1 + STRAIN))
    ax.set_ylim(-1.55, 1.95)
    ax.set_title("Side profile of the channel, unrolled — stretching FLATTENS the "
                 "wave and SPREADS it\nthe two cancel, so the conductor never gets "
                 "longer", fontsize=13)
    ax.grid(True)
    ax.legend(loc="lower right", framealpha=0.0, ncol=2)
    for s_ in ax.spines.values():
        s_.set_alpha(0.5)

    # --- bottom: the length bookkeeping ---
    ax2 = fig.add_subplot(gs[1])
    labels = ["In-plane path\n(what a flat loop has)",
              "Out-of-plane\nexcess", "3D conductor\nlength"]
    v0 = [sa, la - sa, la]
    v1 = [sb, lb - sb, lb]
    xpos = range(len(labels))
    w = 0.36
    ax2.bar([x - w / 2 for x in xpos], v0, w, color=C_ZWAVE, label="0 % strain")
    ax2.bar([x + w / 2 for x in xpos], v1, w, color=C_BODY,
            label=f"{STRAIN*100:.0f} % strain")
    for x, (p, q) in enumerate(zip(v0, v1)):
        pct = 100 * (q / p - 1)
        ax2.text(x, max(p, q) + 5, f"{pct:+.2f} %", ha="center", fontsize=13,
                 weight="bold", color=C_BODY if abs(pct) > 1 else C_BEST_OK)
        ax2.text(x - w / 2, p / 2, f"{p:.1f}", ha="center", va="center",
                 fontsize=10.5, color="#10243a", weight="bold")
        ax2.text(x + w / 2, q / 2, f"{q:.1f}", ha="center", va="center",
                 fontsize=10.5, color="#10243a", weight="bold")
    ax2.set_xticks(list(xpos))
    ax2.set_xticklabels(labels, fontsize=11)
    ax2.set_ylabel("Length (mm)")
    ax2.set_ylim(0, max(la, lb) * 1.22)
    ax2.set_title("The in-plane path grows 6 %. The conductor does not.",
                  fontsize=13)
    ax2.grid(True, axis="y")
    ax2.legend(loc="upper center", framealpha=0.0, ncol=2)
    for s_ in ax2.spines.values():
        s_.set_alpha(0.5)

    save(fig, "F20_stretch_side_profile.png")
    write_csv("F20_stretch_side_profile.csv",
              ["quantity", "at_0pct", "at_20pct", "change_pct"],
              [["z_amplitude_mm", za, zb, 100 * (zb / za - 1)],
               ["peak_to_peak_z_mm", 2 * za, 2 * zb, 100 * (zb / za - 1)],
               ["in_plane_path_mm", sa, sb, 100 * (sb / sa - 1)],
               ["out_of_plane_excess_mm", la - sa, lb - sb,
                100 * ((lb - sb) / (la - sa) - 1)],
               ["conductor_3D_length_mm", la, lb, 100 * (lb / la - 1)],
               ["max_wave_slope_deg", max_slope_deg(a), max_slope_deg(b),
                100 * (max_slope_deg(b) / max_slope_deg(a) - 1)]])
    print(f"      F20: z_amp {za:.3f}->{zb:.3f} mm ({100*(zb/za-1):+.1f} %), "
          f"in-plane {sa:.2f}->{sb:.2f} ({100*(sb/sa-1):+.2f} %), "
          f"3D {la:.2f}->{lb:.2f} ({100*(lb/la-1):+.3f} %), "
          f"slope {max_slope_deg(a):.1f}->{max_slope_deg(b):.1f} deg")


C_BEST_OK = "#7CFC98"


# --------------------------------------------------------------- F21 -------
def f21():
    """Result + mechanism, side by side, at the CURRENT design point.

    LEFT  full-wave CST drift (zwstrain85 vs zwflatB, matched geometry)
    RIGHT geometric conductor path length, integrated from the macro's own curve

    The two panels deliberately do NOT agree in magnitude, and the caption says
    so: path length predicts ~0 % for the z-wave, full-wave measures -7.82 %.
    Path length is about half the story -- see docs/ZWAVE-STRAIN-FINDINGS.md.
    """
    R, AMP, SKEW, NU, GAP = 8.5, 1.7, 0.425, 12, 1.0
    Z_AMP, Z_CYC, M = 1.004, 24, 400_000
    STRAINS = (0.0, 0.05, 0.10, 0.15, 0.20)

    def arc(e, z_amp):
        lx, lt = 1 + e, 1 / math.sqrt(1 + e)
        dg = min(GAP / (R + AMP + 2 * SKEW * NU), 0.6)
        tA, tB = dg / 2, 2 * math.pi - dg / 2
        tot, prev = 0.0, None
        for i in range(M + 1):
            t = tA + (tB - tA) * i / M
            uu = R + AMP * math.sin(NU * t + math.pi / 2)
            vv = SKEW * math.sin(2 * NU * t + math.pi)
            ct, st = math.cos(t), math.sin(t)
            p = (lx * (uu * ct + vv * st), lt * (uu * st - vv * ct),
                 lt * z_amp * math.cos(Z_CYC * t))
            if prev is not None:
                tot += math.dist(p, prev)
            prev = p
        return tot

    Lz = [arc(e, Z_AMP) for e in STRAINS]
    Lf = [arc(e, 0.0) for e in STRAINS]
    dLz = [100 * (v / Lz[0] - 1) for v in Lz]
    dLf = [100 * (v / Lf[0] - 1) for v in Lf]

    zw, fl = s11_by_strain("zwstrain85.cst"), s11_by_strain("zwflatB.cst")

    def drift(data):
        ss = sorted(data)
        f0 = dip(*data[ss[0]])[0]
        return [100 * s for s in ss], [100 * (dip(*data[s])[0] - f0) / f0
                                       for s in ss]

    xz, dz = drift(zw)
    xf, df = drift(fl)

    fig, (axL, axR) = plt.subplots(1, 2, figsize=(14.5, 5.9))

    # ---- left: full-wave result ----
    axL.axhspan(-1.7, 1.7, color=C_SERP, alpha=0.13, zorder=0)
    axL.text(0.25, 1.72, "BLE tolerance ±1.7 %", fontsize=10, color=C_SERP,
             va="bottom")
    axL.plot(xf, df, "o-", color=C_SERP, lw=2.5, ms=8, mec=FG, mew=1.0,
             label="flat control  ($z_{amp}$ = 0)")
    axL.plot(xz, dz, "s-", color=C_ZWAVE, lw=2.5, ms=8, mec=FG, mew=1.0,
             label="z-wave  ($z_{amp}$ = 1.004 mm)")
    for x, y, c in ((xf[-1], df[-1], C_SERP), (xz[-1], dz[-1], C_ZWAVE)):
        axL.annotate(f"{y:+.2f} %", (x, y), textcoords="offset points",
                     xytext=(-14, -20), color=c, fontsize=12.5, weight="bold")
    axL.axhline(0, color=FG, lw=0.8, ls=":", alpha=0.55)
    axL.set_xlabel("Uniaxial strain (%)")
    axL.set_ylabel("$\\Delta f_0$ (%)")
    axL.set_title("FULL-WAVE result — frequency drift\n"
                  f"{dz[-1]:.2f} % vs {df[-1]:.2f} % at 20 %  →  "
                  f"{100*(1-dz[-1]/df[-1]):.0f} % less drift", fontsize=12.5)
    axL.legend(loc="lower left", framealpha=0.0, fontsize=10.5)
    axL.grid(True)

    # ---- right: geometric mechanism ----
    xs = [100 * e for e in STRAINS]
    axR.plot(xs, dLf, "o-", color=C_SERP, lw=2.5, ms=8, mec=FG, mew=1.0,
             label="flat conductor length")
    axR.plot(xs, dLz, "s-", color=C_ZWAVE, lw=2.5, ms=8, mec=FG, mew=1.0,
             label="z-wave conductor length")
    axR.axhline(0, color=FG, lw=0.8, ls=":", alpha=0.55)
    axR.annotate(f"{dLf[-1]:+.2f} %", (xs[-1], dLf[-1]),
                 textcoords="offset points", xytext=(-52, -4),
                 color=C_SERP, fontsize=12.5, weight="bold")
    axR.annotate(f"{dLz[-1]:+.3f} %", (xs[-1], dLz[-1]),
                 textcoords="offset points", xytext=(-48, 12),
                 color=C_ZWAVE, fontsize=12.5, weight="bold")
    axR.set_xlabel("Uniaxial strain (%)")
    axR.set_ylabel("$\\Delta L$ (%)")
    axR.set_title("MECHANISM — conductor path length\n"
                  f"flat grows {dLf[-1]:+.2f} %, z-wave stays within "
                  f"{max(abs(v) for v in dLz):.2f} %", fontsize=12.5)
    axR.legend(loc="upper left", framealpha=0.0, fontsize=10.5)
    axR.grid(True)

    for ax in (axL, axR):
        for s_ in ax.spines.values():
            s_.set_alpha(0.5)

    fig.text(0.5, -0.035,
             "The two panels differ in magnitude on purpose: path length alone "
             "predicts ~0 % for the z-wave, full-wave measures −7.82 %. "
             "Path growth is about half the drift —\nthe rest is substrate "
             "thinning changing body standoff, and only ~62 % of out-of-plane "
             "length being electrically realised.",
             ha="center", va="top", fontsize=9.5, color=FG, alpha=0.85)

    fig.tight_layout()
    save(fig, "F21_result_and_mechanism.png")
    write_csv("F21_result_and_mechanism.csv",
              ["strain_pct", "dL_pct_zwave", "dL_pct_flat",
               "df0_pct_zwave_fullwave", "df0_pct_flat_fullwave"],
              [[xs[i], dLz[i], dLf[i],
                dz[i] if i < len(dz) else "",
                df[i] if i < len(df) else ""] for i in range(len(xs))])
    print(f"      F21: dL flat {dLf[-1]:+.3f} %, dL z-wave {dLz[-1]:+.4f} % "
          f"(max |dL| {max(abs(v) for v in dLz):.3f} %); "
          f"full-wave {df[-1]:.2f} % vs {dz[-1]:.2f} %")


# --------------------------------------------------------------- F22 -------
def f22():
    """The raw S11 families behind the strain comparison, both designs.

    These are the sweeps F2/F21's left panel is derived FROM. Both are bare-loop
    delta-gap models (no SSMA feed) at serp_R 8.5 / sub_h 6.508, differing only
    in z_amp, so the pair is a controlled comparison. Neither is tuned to
    2.45 GHz -- the flat control sits near 2.62, the z-wave near 2.17 -- because
    the PERCENTAGE shift is the result, not the absolute frequency.
    """
    zw = s11_by_strain("zwstrain85.cst")
    fl = s11_by_strain("zwflatB.cst")

    fig, axes = plt.subplots(1, 2, figsize=(15, 6.0), sharey=True)
    panels = [(axes[0], fl, C_SERP, "Flat control", "$z_{amp}$ = 0"),
              (axes[1], zw, C_ZWAVE, "Z-wave", "$z_{amp}$ = 1.004 mm")]
    table = {}

    for ax, data, base, name, sub in panels:
        ss = sorted(data)
        f0_ref = dip(*data[ss[0]])[0]
        for j, s in enumerate(ss):
            f, y = data[s]
            d = dip(f, y)
            shade = 0.32 + 0.68 * j / max(len(ss) - 1, 1)
            ax.plot(f, y, color=base, alpha=shade, lw=2.3,
                    label=f"{100*s:>2.0f} %  →  {d[0]:.3f} GHz  "
                          f"{100*(d[0]-f0_ref)/f0_ref:+.2f} %")
            ax.plot([d[0]], [d[1]], "o", color=base, alpha=shade, ms=6,
                    mec=FG, mew=0.8, zorder=5)
            table[(name, 100 * s)] = (d[0], d[1],
                                      100 * (d[0] - f0_ref) / f0_ref)
        ax.axvspan(BLE_LO, BLE_HI, color=C_BLE, alpha=0.15, zorder=0)
        ax.axhline(-10, color=FG, lw=1.0, ls="--", alpha=0.7, zorder=1)
        ax.set_xlim(1.5, 3.2)
        ax.set_ylim(-40, 13)
        ax.set_xlabel("Frequency (GHz)")
        ax.set_title(f"{name} — {sub}\nresonance walks LEFT as strain increases",
                     fontsize=12.5)
        ax.grid(True)
        ax.legend(loc="upper center", framealpha=0.0, fontsize=9.5, ncol=2,
                  title="applied strain  →  resonance", title_fontsize=10)
        for s_ in ax.spines.values():
            s_.set_alpha(0.5)
    axes[0].set_ylabel("$S_{11}$ (dB), delta-gap port")

    fig.text(0.5, -0.02,
             "Bare-loop delta-gap models at serp_R 8.5 / sub_h 6.508, identical "
             "except z_amp. Neither is tuned to 2.45 GHz — the % shift is the "
             "result, not the absolute frequency.",
             ha="center", va="top", fontsize=9.5, color=FG, alpha=0.85)
    fig.tight_layout()
    save(fig, "F22_S11_strain_families.png")

    # one tidy CSV per design, plus the summary
    for name, data in (("zwave", zw), ("flat", fl)):
        ss = sorted(data)
        ref = data[ss[0]][0]
        cols = [f"S11_dB_{100*s:.0f}pct" for s in ss]
        rows = []
        for i in range(len(ref)):
            rows.append([ref[i]] + [data[s][1][i] for s in ss])
        write_csv(f"F22_S11_strain_{name}.csv", ["freq_GHz"] + cols, rows)

    write_csv("F22_resonance_summary.csv",
              ["design", "strain_pct", "f0_GHz", "S11_min_dB", "delta_f_pct"],
              [[k[0], k[1], v[0], v[1], v[2]] for k, v in sorted(table.items())])
    for k, v in sorted(table.items()):
        print(f"      {k[0]:<13} {k[1]:>3.0f} %  f0 {v[0]:.4f} GHz  "
              f"{v[1]:7.2f} dB  {v[2]:+7.2f} %")


# --------------------------------------------------------------- F23 -------
def f23():
    """The z-wave RETUNED so its zero-strain resonance sits in BLE.

    Bare loop, delta-gap port, on body -- NOT the 2 x SSMA fed design, which is
    tuned on differential Sdd11 and has no dip by construction. Rescaled from the
    strain-study geometry holding the design's own couplings
    (z_amp = 0.1181*serp_R, sub_h for 2 mm cover), so the strain optimum is kept.
    """
    it = _mod("zwble.cst").get_result_item(SP + "S1,1", 0)
    f = [float(x) for x in it.get_xdata()]
    y = [db(complex(v)) for v in it.get_ydata()]
    f0, d0 = dip(f, y)

    below = [f[i] for i in range(len(f)) if y[i] <= -10.0]
    lo, hi = min(below), max(below)
    band = [i for i in range(len(f)) if BLE_LO <= f[i] <= BLE_HI]
    worst = max(y[i] for i in band)

    fig, ax = plt.subplots(figsize=(10.5, 6.0))
    dress(ax, xlo=1.8, xhi=3.2, ylab="$S_{11}$ (dB), delta-gap port")
    ax.axvspan(lo, hi, color=C_ZWAVE, alpha=0.10, zorder=0)
    ax.plot(f, y, color=C_ZWAVE, lw=2.6,
            label="Z-wave, retuned — serp_R 7.567, $z_{amp}$ 0.894, "
                  "sub_h 6.288 mm")
    ax.plot([f0], [d0], "o", color=C_ZWAVE, ms=10, mec=FG, mew=1.3, zorder=6)
    ax.annotate(f"$f_0$ = {f0:.3f} GHz\n{d0:.1f} dB", (f0, d0),
                textcoords="offset points", xytext=(14, 10),
                color=C_ZWAVE, fontsize=12.5, weight="bold")

    ax.annotate("", xy=(lo, -5.0), xytext=(hi, -5.0),
                arrowprops=dict(arrowstyle="<->", color=C_ZWAVE, lw=1.6))
    ax.text((lo + hi) / 2, -4.4,
            f"$S_{{11}}$ below $-$10 dB over {lo:.3f}–{hi:.3f} GHz" + "\n"
            + f"{1000*(hi-lo):.0f} MHz ({100*(hi-lo)/f0:.1f} %)",
            ha="center", va="bottom", color=C_ZWAVE, fontsize=11, weight="bold")
    ax.text(BLE_LO - 0.02, worst, f"worst across BLE\n{worst:.1f} dB",
            ha="right", va="center", color=C_BLE, fontsize=11, weight="bold")

    ax.set_ylim(min(y) - 4, 0)
    ax.set_title("Z-wave retuned to BLE — bare loop, zero strain, on body\n"
                 "covers 2.400–2.4835 GHz with 7.7 dB of margin", fontsize=13)
    ax.legend(loc="lower left", framealpha=0.0, fontsize=10)
    save(fig, "F23_S11_zwave_tuned_BLE.png")
    write_csv("F23_S11_zwave_tuned_BLE.csv", ["freq_GHz", "S11_dB"],
              [[f[i], y[i]] for i in range(len(f))])
    print(f"      F23: f0 {f0:.4f} GHz {d0:.2f} dB, -10 dB {lo:.3f}-{hi:.3f} "
          f"({1000*(hi-lo):.0f} MHz), worst in BLE {worst:.2f} dB")


def f24():
    """Four measured conditions, from the PERSPECTIVE-CORRECTED screens.

    History worth keeping, because it is why this figure can be trusted now and
    could not be before. Two digitisers were run on the original angled photos and
    disagreed by up to 176 MHz on dip position -- more than the effect being
    measured -- so the curves were withdrawn and only the marker readouts shown.
    With the perspective removed the graticule is axis-aligned, its pitch is
    recovered consistently (~27 px per 2 dB on all four), and the trace tracks
    cleanly across the whole sweep.

    Calibration is scale-from-graticule, origin-from-marker: pitch gives dB/px and
    GHz/px, and each screen's own printed marker value fixes the offset. Nothing
    depends on identifying which gridline is 0 dB, which was the step that kept
    going wrong. Checked by reading each trace back at the marker: -14.62, -14.42,
    -10.69, -11.62 dB against printed -13.70, -14.06, -10.18, -11.13, i.e. within
    0.4-0.9 dB, the residual being trace thickness on a steep slope.
    """
    # ALL FOUR HAND-TRACED. The automatic extraction is retired for this figure:
    # scored against the one .set file available it runs 2.1-2.3 dB too deep,
    # consistently, on two separate conditions. The hand traces come in at
    # RMS ~0.8 dB with no bias (scripts/check_digitisation.py), so they are both
    # better AND, being one method across all four, internally consistent -- which
    # is what a comparison figure needs.
    #
    # Their known weakness is the dip: hand traces place it 27-51 MHz LOW and
    # around 0.9 dB too deep, because eye-tracking the bottom of a narrow V is the
    # hard case. Read the shapes and the level separations here; take resonance
    # frequency from the marker, not from the plotted minimum.
    CONDS = [("manual_baseline.csv", "Baseline — flat, free space", C_ZWAVE, -11.13),
             ("manual_stretch.csv",  "Stretched",                   C_SERP,  -13.70),
             ("manual_bend.csv",     "Bent",                        C_CONC,  -14.06),
             ("manual_skin.csv",     "On skin",                     C_BODY,  -10.18)]
    MF = 2.63999

    fig, ax = plt.subplots(figsize=(11, 6.4))
    dress(ax, xlo=1.8, xhi=3.4, ylab="$S_{11}$ (dB), single-ended, 50 $\Omega$")
    rows = []
    for fname, lab, c, mk in CONDS:
        with open(os.path.join(OUT, fname), encoding="utf-8") as fh:
            r = list(csv.reader(fh))[1:]
        pts = sorted((float(a), float(b)) for a, b in r)   # hand traces are unsorted
        f = [a for a, _ in pts]
        y = [b for _, b in pts]
        sel = [i for i in range(len(f)) if 1.75 <= f[i] <= 3.45]
        f = [f[i] for i in sel]
        y = [y[i] for i in sel]
        ax.plot(f, y, color=c, lw=2.4, label=f"{lab}    marker {mk:+.2f} dB")
        # Dip triangles and marker circles were dropped at the author's request.
        # The exact readouts still travel with the figure -- in the legend, and in
        # the CSV alongside each dip -- they are simply not drawn.
        k = min(range(len(y)), key=lambda i: y[i])
        rows.append([lab, round(f[k], 4), round(y[k], 2), mk])

    ax.axvline(MF, color=FG, lw=1.0, ls=":", alpha=0.55)
    ax.annotate("2.640 GHz\nmarker (exact)", xy=(MF, 0.03),
                xycoords=("data", "axes fraction"), ha="center", va="bottom",
                fontsize=9.5, color=FG, alpha=0.9)
    ax.set_ylim(-17, -1)
    ax.set_title("Measured $S_{11}$, four conditions — from perspective-corrected "
                 "screens", fontsize=13)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.13), fontsize=10,
              frameon=False, ncol=2)
    save(fig, "F24_measured_conditions.png")
    write_csv("F24_measured_conditions.csv",
              ["condition", "dip_freq_GHz", "dip_S11_dB", "marker_dB_exact"], rows)
    for r in rows:
        print(f"      F24 {r[0]:<28} dip {r[1]:.4f} GHz {r[2]:+6.2f} dB")



def f25():
    """Method check: the same sweep digitised automatically and by hand.

    The stretch screen is the one condition traced both ways -- by the automatic
    pipeline here, and by hand off the same corrected image. Two independent
    methods on identical input, so the spread between them IS the uncertainty on
    every curve in F24.

    They agree where it matters and disagree where it does not:
      dip position   2.6203 vs 2.6127 GHz -- 8 MHz apart
      dip depth      -14.73 vs -13.71 dB
      absolute level ~2.5 dB RMS offset across 1.9-3.3 GHz

    So dip POSITION is solid to well under 10 MHz, and absolute LEVEL is good to
    only a couple of dB. Read F24 for where the resonances sit and how they move;
    quote the marker readouts for level.

    Note the hand trace lands on the printed marker value at its dip (-13.709 vs
    -13.70) while the automatic one runs ~1 dB deep there, because the marker
    line occludes exactly the steep V it sits on.
    """
    def load(name):
        with open(os.path.join(OUT, name), encoding="utf-8") as fh:
            r = list(csv.reader(fh))[1:]
        pts = sorted((float(a), float(b)) for a, b in r)
        return [a for a, _ in pts], [b for _, b in pts]

    fa, ya = load("rect_stretch.csv")
    fm, ym = load("manual_stretch.csv")
    fig, ax = plt.subplots(figsize=(10, 5.8))
    dress(ax, xlo=1.8, xhi=3.4, ylab="$S_{11}$ (dB), single-ended, 50 $\Omega$")
    ax.plot(fa, ya, color=C_SERP, lw=2.4, label="Automatic extraction")
    ax.plot(fm, ym, color=C_BODY, lw=2.4, ls="--", label="Hand-traced")
    ax.plot([2.63999], [-13.70], "o", color=FG, ms=10, mec="#10243a", mew=1.2,
            zorder=6, label="Instrument readout  −13.70 dB")
    ax.set_ylim(-17, -1)
    ax.set_title("Same sweep, two independent digitisations — the stretch screen\n"
                 "dip position agrees to 8 MHz; absolute level differs by ~2.5 dB",
                 fontsize=12.5)
    ax.legend(loc="lower right", framealpha=0.0, fontsize=10)
    save(fig, "F25_digitisation_check.png")
    n = min(len(fa), len(fm))
    write_csv("F25_digitisation_check.csv",
              ["freq_GHz_auto", "S11_dB_auto", "freq_GHz_manual", "S11_dB_manual"],
              [[fa[i] if i < len(fa) else "", ya[i] if i < len(ya) else "",
                fm[i] if i < len(fm) else "", ym[i] if i < len(ym) else ""]
               for i in range(max(len(fa), len(fm)))])



print(f"writing to {OUT}")
for fn in (f1, f2, f3, f4, f7, f12, f13, f14, f15, f17, f18, f19, f20, f21, f22,
           f23, f24, f25):
    try:
        fn()
    except SystemExit as exc:
        print(f"  SKIP {fn.__name__}: {exc}")
