#!/usr/bin/env python3
"""Radiation efficiency AND delivered-power efficiency for every solved run.

Why: the scans have been ranking on |Sdd11| alone, which is a mistake once the
loop is driven past anti-resonance. There, a better match can come from operating
on a higher-order mode -- more pattern nulls, less useful radiation -- so the match
improves while the antenna gets worse. The figure that actually matters is

    delivered = rad_eff x (1 - |Sdd11|^2)

i.e. radiation efficiency derated by the differential mismatch. This pairs each
run's parameters with both numbers so the ranking can be redone honestly.

Runs are matched by parameter combination, never by max(run_id) -- CST puts the
current parameter set in run_id 0 and stored combinations at higher ids.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.results as cr  # noqa: E402

ROOT = r"C:\Users\Bryan\Documents\GitHub\EM-1D"
PROJ = os.path.join(ROOT, "work", sys.argv[1] if len(sys.argv) > 1
                    else "zwave-feed3.cst")
BASE = "1D Results\\S-Parameters\\"
F0 = 2.44

pf = cr.ProjectFile(PROJ, allow_interactive=True)
mod = pf.get_3d()


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -999.0


rows = []
for rid in sorted(mod.get_all_run_ids()):
    try:
        pc = mod.get_parameter_combination(rid)
        r = float(pc.get("serp_R"))
        sh = float(pc.get("sub_h"))
    except Exception:
        continue

    # differential S at 2.44
    try:
        S = {}
        for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
            it = mod.get_result_item(BASE + nm, rid)
            xs = [float(x) for x in it.get_xdata()]
            ys = [complex(y) for y in it.get_ydata()]
            if not xs:
                raise RuntimeError("empty")
            S[nm] = (xs, ys)
        f = S["S1,1"][0]
        i = min(range(len(f)), key=lambda k: abs(f[k] - F0))
        sdd = (S["S1,1"][1][i] - S["S1,2"][1][i]
               - S["S2,1"][1][i] + S["S2,2"][1][i]) / 2
    except Exception:
        continue

    # radiation efficiency at 2.44 from the SAME run
    rad = None
    for tp in mod.get_tree_items("0D/1D"):
        if "Rad. Efficiency" not in tp:
            continue
        try:
            it = mod.get_result_item(tp, rid)
            xs = [float(x) for x in it.get_xdata()]
            ys = [abs(complex(y)) for y in it.get_ydata()]
            if not xs:
                continue
            k = min(range(len(xs)), key=lambda j: abs(xs[j] - F0))
            v = ys[k]
            rad = 100 * (10 ** (v / 10)) if v <= 0 else 100 * v
            break
        except Exception:
            continue
    if rad is None:
        continue

    g2 = abs(sdd) ** 2
    rows.append({
        "rid": rid, "serp_R": r, "sub_h": sh,
        "sdd_dB": db(sdd), "rad_pct": rad,
        "delivered_pct": rad * (1 - g2),
    })

rows.sort(key=lambda x: (round(x["sub_h"], 1), x["serp_R"]))
print(f"{'rid':>4} {'serp_R':>7} {'sub_h':>7} {'Sdd11':>8} {'rad eff':>9} "
      f"{'delivered':>10}")
print("-" * 52)
for x in rows:
    print(f"{x['rid']:4d} {x['serp_R']:7.2f} {x['sub_h']:7.3f} "
          f"{x['sdd_dB']:7.2f}dB {x['rad_pct']:8.2f}% {x['delivered_pct']:9.2f}%")

if rows:
    bm = min(rows, key=lambda x: x["sdd_dB"])
    bd = max(rows, key=lambda x: x["delivered_pct"])
    print()
    print(f"best MATCH      : serp_R {bm['serp_R']:.2f}, sub_h {bm['sub_h']:.3f}"
          f"  -> {bm['sdd_dB']:.2f} dB, delivered {bm['delivered_pct']:.2f} %")
    print(f"best DELIVERED  : serp_R {bd['serp_R']:.2f}, sub_h {bd['sub_h']:.3f}"
          f"  -> {bd['sdd_dB']:.2f} dB, delivered {bd['delivered_pct']:.2f} %")
    if abs(bm["serp_R"] - bd["serp_R"]) > 1e-6:
        print()
        print("  *** they DISAGREE: ranking on match alone picks the wrong "
              "design. ***")
