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


print(f"writing to {OUT}")
for fn in (f1, f2, f3, f4, f12, f13, f14, f15, f17, f18):
    try:
        fn()
    except SystemExit as exc:
        print(f"  SKIP {fn.__name__}: {exc}")
