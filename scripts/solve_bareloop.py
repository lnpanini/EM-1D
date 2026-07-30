#!/usr/bin/env python3
"""Bare-loop z-wave at the FABRICATED geometry, single port across the feed gap.

WHY: the proposed bench change -- one coax, centre to one pad, shield to the
other -- is topologically the bare-loop delta-gap model, NOT the 2 x SSMA
differential model. cst/serp-zwave.vba already defines exactly one discrete port
from loop terminal to loop terminal, which is what that cable does.

So this solves the AS-FABRICATED geometry (serp_R 8.5, sub_h 6.508, the point the
STEP and mould came from) as a bare loop, in free space and on body, to give the
prediction the proposed measurement should be compared against.

Usage:  solve_bareloop.py [free|body] [serp_R] [sub_h]
"""

from __future__ import annotations

import json
import math
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import cst_bridge as cb  # noqa: E402

MODE = sys.argv[1] if len(sys.argv) > 1 else "free"
SERP_R = float(sys.argv[2]) if len(sys.argv) > 2 else 8.5
SUB_H = float(sys.argv[3]) if len(sys.argv) > 3 else 6.508
Z_RATIO = 0.118117
Z_AMP = Z_RATIO * SERP_R

PROJECT = os.path.join(ROOT, "work", f"zwbare-{MODE}.cst")
MACRO = os.path.join(ROOT, "cst", "serp-zwave.vba")
BASE = "1D Results\\S-Parameters\\S1,1"


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -999.0


def main():
    _, ci, cr = cb.load_cst(None)
    de = cb.open_environment(ci, new=False, quiet=True)
    prj, created = cb.open_or_create_project(de, PROJECT)
    cb.note(f"{PROJECT} (created={created})  mode={MODE}  "
            f"serp_R={SERP_R} z_amp={Z_AMP:.4f} sub_h={SUB_H}")
    with open(MACRO, encoding="utf-8") as fh:
        cb.apply_macro(prj, fh.read(), header=f"bare loop {MODE}", mode="execute")

    vba = ['sub main',
           f'StoreDoubleParameter "serp_R", {SERP_R!r}',
           f'StoreDoubleParameter "z_amp", {round(Z_AMP, 6)!r}',
           f'StoreDoubleParameter "sub_h", {SUB_H!r}',
           'StoreDoubleParameter "strain", 0.0']
    if MODE == "free":
        vba.append('AddToHistory "delete phantom", '
                   '"Solid.Delete ""tissue:Skin""" & vbLf & '
                   '"Solid.Delete ""tissue:Fat""" & vbLf & '
                   '"Solid.Delete ""tissue:Muscle"""')
    vba.append('end sub')
    prj.model3d._execute_vba_code("\n".join(vba))
    prj.model3d.full_history_rebuild()
    prj.save(allow_overwrite=True)

    t0 = time.time()
    prj.model3d.run_solver()
    prj.save(allow_overwrite=True)
    cb.note(f"solved in {time.time()-t0:.0f} s")

    mod = cr.ProjectFile(PROJECT, allow_interactive=True).get_3d()
    it = mod.get_result_item(BASE, 0)
    f = [float(x) for x in it.get_xdata()]
    y = [db(complex(v)) for v in it.get_ydata()]
    cand = [(f[i], y[i]) for i in range(1, len(f) - 1)
            if y[i] <= y[i - 1] and y[i] < y[i + 1] and y[i] < -3]
    f0, d0 = min(cand, key=lambda t: t[1]) if cand else (f[y.index(min(y))],
                                                         min(y))
    below = [f[i] for i in range(len(f)) if y[i] <= -10.0]
    band = [i for i in range(len(f)) if 2.400 <= f[i] <= 2.4835]
    out = {"ok": True, "mode": MODE, "project": PROJECT,
           "serp_R": SERP_R, "z_amp": round(Z_AMP, 4), "sub_h": SUB_H,
           "f0_GHz": round(f0, 4), "dip_dB": round(d0, 2),
           "below10dB_GHz": [round(min(below), 4), round(max(below), 4)]
           if below else None,
           "bandwidth_MHz": round(1000 * (max(below) - min(below)), 1)
           if below else None,
           "worstInBLE_dB": round(max(y[i] for i in band), 2) if band else None}
    print(json.dumps(out, indent=2))
    with open(os.path.join(ROOT, "work", f"zwbare_{MODE}.json"), "w",
              encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
