#!/usr/bin/env python3
"""Tune the BARE-LOOP z-wave so its zero-strain resonance lands in BLE.

WHY THIS EXISTS
The strain study (zwstrain85) runs at serp_R 8.5, where the bare loop resonates
at 2.174 GHz. That is deliberate -- the strain result is a PERCENTAGE -- but it
means no figure shows the z-wave actually resonating in band, and "why is your
BLE antenna at 2.17 GHz?" is an obvious question.

This rescales the loop so the delta-gap dip sits at 2.45 GHz at zero strain,
holding the design's own couplings:
    z_amp  = 0.118117 * serp_R      (keeps the a/lambda_z strain optimum)
    sub_h  = 2*(z_amp + chan_r + cover)   with cover = 2.0 mm (fabrication limit)

Iterates serp_R by f_measured/2.45 until the dip is within tolerance. Two or
three passes converged for every earlier tuning in this project.

NOTE this is the bare loop with a delta-gap port, NOT the 2 x SSMA differential
design. The fed design is tuned on differential Sdd11, which has no dip by
construction (see docs/ZWAVE-FEED-FINDINGS.md section 2).

Usage:  tune_zwave_ble.py [start_serp_R] [max_iters]
"""

from __future__ import annotations

import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import cst_bridge as cb  # noqa: E402

PROJECT = os.path.join(ROOT, "work", "zwble.cst")
MACRO = os.path.join(ROOT, "cst", "serp-zwave.vba")
TARGET = 2.45
TOL = 0.010                     # GHz
Z_RATIO, CHAN_R, COVER = 0.118117, 0.25, 2.0
BASE = "1D Results\\S-Parameters\\S1,1"

start_R = float(sys.argv[1]) if len(sys.argv) > 1 else 8.5 * (2.174 / TARGET)
MAX_IT = int(sys.argv[2]) if len(sys.argv) > 2 else 4


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -999.0


def read_dip(cr):
    mod = cr.ProjectFile(PROJECT, allow_interactive=True).get_3d()
    it = mod.get_result_item(BASE, 0)
    f = [float(x) for x in it.get_xdata()]
    y = [db(complex(v)) for v in it.get_ydata()]
    cand = [(f[i], y[i]) for i in range(1, len(f) - 1)
            if y[i] <= y[i - 1] and y[i] < y[i + 1] and y[i] < -3]
    if not cand:
        raise RuntimeError("no resonance found in the sweep")
    return min(cand, key=lambda t: t[1]), f, y


def main():
    _, ci, cr = cb.load_cst(None)
    de = cb.open_environment(ci, new=False, quiet=True)
    prj, created = cb.open_or_create_project(de, PROJECT)
    cb.note(f"project {PROJECT} (created={created})")
    with open(MACRO, encoding="utf-8") as fh:
        cb.apply_macro(prj, fh.read(), header="z-wave BLE tune", mode="execute")

    R = start_R
    hist = []
    for k in range(MAX_IT):
        z_amp = Z_RATIO * R
        sub_h = 2.0 * (z_amp + CHAN_R + COVER)
        cb.note(f"--- pass {k+1}: serp_R={R:.4f}, z_amp={z_amp:.4f}, "
                f"sub_h={sub_h:.4f} ---")
        prj.model3d._execute_vba_code(
            'sub main\n'
            f'StoreDoubleParameter "serp_R", {R!r}\n'
            f'StoreDoubleParameter "z_amp", {round(z_amp, 6)!r}\n'
            f'StoreDoubleParameter "sub_h", {round(sub_h, 6)!r}\n'
            'StoreDoubleParameter "strain", 0.0\n'
            'end sub')
        prj.model3d.full_history_rebuild()
        prj.model3d.run_solver()
        prj.save(allow_overwrite=True)

        (f0, d0), f, y = read_dip(cr)
        hist.append({"serp_R": round(R, 4), "z_amp": round(z_amp, 4),
                     "sub_h": round(sub_h, 4), "f0": round(f0, 4),
                     "dip_dB": round(d0, 2)})
        cb.note(f"    f0 = {f0:.4f} GHz at {d0:.2f} dB")
        if abs(f0 - TARGET) <= TOL:
            cb.note("    converged")
            break
        R *= f0 / TARGET

    (f0, d0), f, y = read_dip(cr)
    band = [i for i in range(len(f)) if 2.400 <= f[i] <= 2.4835]
    below = [f[i] for i in range(len(f)) if y[i] <= -10.0]
    out = {
        "ok": True, "project": PROJECT, "history": hist,
        "final": hist[-1],
        "worstInBLE_dB": round(max(y[i] for i in band), 2) if band else None,
        "below10dB_GHz": [round(min(below), 4), round(max(below), 4)]
        if below else None,
        "bandwidth_MHz": round(1000 * (max(below) - min(below)), 1)
        if below else None,
    }
    print(json.dumps(out, indent=2))
    with open(os.path.join(ROOT, "work", "zwble_result.json"), "w",
              encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
