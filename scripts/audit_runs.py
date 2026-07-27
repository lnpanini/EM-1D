#!/usr/bin/env python3
"""Audit every run ID in the feed project: its parameters AND its own Sdd11.

Reason: scan_feed_match.py picked results via `sorted(run_ids, reverse=True)`,
i.e. it assumed the highest run ID is the newest solve. CST does not work that
way -- run_id 0 is the CURRENT parameter set and stored parameter combinations get
higher ids, so "max id" can be an OLDER solve. A re-solve at serp_R 7.5 returned
byte-identical impedance to the previous 7.4 point, which is the signature of a
stale read.

This pairs each run's parameter combination with the Sdd11 computed from THAT SAME
run, so the scan table can be re-derived correctly (or shown to be wrong).
"""

from __future__ import annotations

import math
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.results as cr  # noqa: E402

PROJ = sys.argv[1] if len(sys.argv) > 1 else \
    r"C:\Users\Bryan\Documents\GitHub\EM-1D\work\zwave-feed.cst"
BASE = "1D Results\\S-Parameters\\"

pf = cr.ProjectFile(PROJ, allow_interactive=True)
mod = pf.get_3d()


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -999.0


print(f"{'rid':>4} {'serp_R':>8} {'sub_h':>7} {'z_amp':>7} "
      f"{'Re@2.44':>8} {'Im@2.44':>9} {'Sdd@2.44':>9} {'pts':>5}")
for rid in sorted(mod.get_all_run_ids()):
    try:
        pc = mod.get_parameter_combination(rid)
    except Exception:
        pc = {}
    sr = pc.get("serp_R")
    sh = pc.get("sub_h")
    za = pc.get("z_amp")

    try:
        s = {}
        for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
            it = mod.get_result_item(BASE + nm, rid)
            xs = [float(x) for x in it.get_xdata()]
            ys = [complex(y) for y in it.get_ydata()]
            s[nm] = (xs, ys)
        f = s["S1,1"][0]
        if not f:
            raise RuntimeError("empty")
        sdd = [(a - b - c + d) / 2 for a, b, c, d in
               zip(s["S1,1"][1], s["S1,2"][1], s["S2,1"][1], s["S2,2"][1])]
        zd = [100.0 * (1 + z) / (1 - z) for z in sdd]
        i = min(range(len(f)), key=lambda k: abs(f[k] - 2.44))
        srs = f"{float(sr):8.4f}" if sr is not None else f"{'?':>8}"
        shs = f"{float(sh):7.3f}" if sh is not None else f"{'?':>7}"
        zas = f"{float(za):7.4f}" if za is not None else f"{'?':>7}"
        print(f"{rid:4d} {srs} {shs} {zas} {zd[i].real:8.1f} "
              f"{zd[i].imag:+9.1f} {db(sdd[i]):9.2f} {len(f):5d}")
    except Exception as exc:
        srs = f"{float(sr):8.4f}" if sr is not None else f"{'?':>8}"
        print(f"{rid:4d} {srs} {'':>7} {'':>7}   -- no S-params: "
              f"{str(exc)[:50]}")
