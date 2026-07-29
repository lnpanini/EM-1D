#!/usr/bin/env python3
"""Build and solve the z-wave in FREE SPACE -- no tissue phantom.

Every solved project in this repo sits on the 3-layer phantom, so nothing here
was comparable to a free-space VNA measurement. This builds the same antenna from
`cst/serp-zwave-feed.vba`, deletes the three tissue bricks (they live in their own
`tissue` component, so the delete is clean), sets the design point, and solves.

The deletes go into the history AFTER the bricks are created, so a full rebuild
recreates then removes them -- correct under any later parameter change.

Usage:  solve_freespace.py [project_name]     (default work/zwfree.cst)
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

PROJECT = os.path.join(ROOT, "work",
                       sys.argv[1] if len(sys.argv) > 1 else "zwfree.cst")
MACRO = os.path.join(ROOT, "cst", "serp-zwave-feed.vba")
SERP_R, SUB_H = 8.5, 6.508
BASE = "1D Results\\S-Parameters\\"


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -999.0


def main():
    _, ci, cr = cb.load_cst(None)
    de = cb.open_environment(ci, new=False, quiet=True)
    prj, created = cb.open_or_create_project(de, PROJECT)
    cb.note(f"project {PROJECT} (created={created})")

    with open(MACRO, encoding="utf-8") as fh:
        cb.apply_macro(prj, fh.read(), header="z-wave free space", mode="execute")

    cb.note("setting design point and stripping the phantom")
    prj.model3d._execute_vba_code(
        'sub main\n'
        f'StoreDoubleParameter "serp_R", {SERP_R!r}\n'
        f'StoreDoubleParameter "sub_h", {SUB_H!r}\n'
        'AddToHistory "delete phantom", '
        '"Solid.Delete ""tissue:Skin""" & vbLf & '
        '"Solid.Delete ""tissue:Fat""" & vbLf & '
        '"Solid.Delete ""tissue:Muscle"""\n'
        'end sub')
    prj.model3d.full_history_rebuild()
    prj.save(allow_overwrite=True)

    t0 = time.time()
    prj.model3d.run_solver()
    prj.save(allow_overwrite=True)
    cb.note(f"solved in {time.time()-t0:.0f} s")

    pf = cr.ProjectFile(PROJECT, allow_interactive=True)
    mod = pf.get_3d()
    rid = 0
    S = {}
    for nm in ("S1,1", "S1,2", "S2,1", "S2,2"):
        it = mod.get_result_item(BASE + nm, rid)
        S[nm] = ([float(x) for x in it.get_xdata()],
                 [complex(y) for y in it.get_ydata()])
    f = S["S1,1"][0]
    sdd = [(a - b - c + d) / 2 for a, b, c, d in
           zip(S["S1,1"][1], S["S1,2"][1], S["S2,1"][1], S["S2,2"][1])]
    y = [db(z) for z in sdd]
    i = min(range(len(f)), key=lambda k: abs(f[k] - 2.45))
    kmin = min(range(len(f)), key=lambda k: y[k])
    band = [k for k in range(len(f)) if 2.400 <= f[k] <= 2.4835]
    below10 = [f[k] for k in range(len(f)) if y[k] <= -10.0]

    eff = {}
    for nm in ("Rad. Efficiency [1]", "Tot. Efficiency [1]"):
        try:
            it = mod.get_result_item("1D Results\\Efficiencies\\" + nm, rid)
            eff[nm] = [(float(a), abs(complex(b)))
                       for a, b in zip(it.get_xdata(), it.get_ydata())]
        except Exception as exc:
            eff[nm] = f"unavailable: {exc}"

    out = {
        "ok": True, "project": PROJECT, "serp_R": SERP_R, "sub_h": SUB_H,
        "sdd11At2450dB": round(y[i], 2),
        "worstInBandDB": round(max(y[k] for k in band), 2),
        "minDB": round(y[kmin], 2), "minAtGHz": round(f[kmin], 4),
        "below10dBSpanGHz": [round(min(below10), 4), round(max(below10), 4)]
        if below10 else None,
        "zdiffAt2450": [round((100 * (1 + sdd[i]) / (1 - sdd[i])).real, 1),
                        round((100 * (1 + sdd[i]) / (1 - sdd[i])).imag, 1)],
        "efficiencies": eff,
    }
    print(json.dumps(out, indent=2))
    with open(os.path.join(ROOT, "work", "freespace_result.json"), "w",
              encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
