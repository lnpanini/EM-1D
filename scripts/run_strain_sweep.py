#!/usr/bin/env python3
"""Run the 5-point z-wave strain sweep and read resonance per strain point.

This is the money plot: it should show the z-wave holding BLE frequency under
stretch where the flat serpentine walked off by -8.8 % at 20 %.

The base model must already be tuned -- serp_R and its coupled z_amp are left at
whatever the frequency tune set them to; only `strain` is swept (0/5/10/15/20 %).
The sweep macro is run with mode='execute': ParameterSweep.Start is an action,
not geometry, so it must NOT go into the history list (where it would re-run on
every rebuild).

Efficiency is deliberately NOT reported here. The far-field monitor sits at
2.44 GHz, but under strain the resonance moves off 2.44, so an efficiency read
at the monitor would be measuring mismatch, not radiation. Resonance (the S11
dip) is what this sweep is for; per-point efficiency needs a monitor placed at
each point's own resonance and is done separately on the final design.
"""

from __future__ import annotations

import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import cst_bridge as cb  # noqa: E402

PROJECT = os.path.join(ROOT, "work", sys.argv[1]) if len(sys.argv) > 1 \
    else os.path.join(ROOT, "work", "zwave.cst")
RESULT_JSON = os.path.join(
    ROOT, "work",
    os.path.splitext(os.path.basename(PROJECT))[0] + "_strain_result.json")
SWEEP_MACRO = os.path.join(ROOT, "cst", "zwave-strain-sweep.vba")
TP = "1D Results\\S-Parameters\\S1,1"
BLE_LO, BLE_HI = 2.400, 2.4835


def db_trace(item):
    f = [float(x) for x in item.get_xdata()]
    db = [20 * math.log10(abs(complex(y))) if abs(complex(y)) > 0 else -120
          for y in item.get_ydata()]
    return f, db


def dip_near(f, db, target=2.44):
    dips = [(f[i], db[i]) for i in range(1, len(f) - 1)
            if db[i] <= db[i - 1] and db[i] < db[i + 1] and db[i] < -3]
    if not dips:
        return None
    return min(dips, key=lambda t: abs(t[0] - target))


def ble_coverage(f, db, f0):
    i0 = min(range(len(f)), key=lambda i: abs(f[i] - f0))
    lo, hi = f[0], f[-1]
    for i in range(i0, 0, -1):
        if db[i - 1] > -10:
            lo = f[i]
            break
    for i in range(i0, len(f) - 1):
        if db[i + 1] > -10:
            hi = f[i]
            break
    cov = max(0.0, min(hi, BLE_HI) - max(lo, BLE_LO)) / (BLE_HI - BLE_LO) * 100
    return lo, hi, cov


def main():
    _, ci, cr = cb.load_cst(None)
    de = cb.open_environment(ci, new=False, quiet=True)
    prj, _ = cb.open_or_create_project(de, PROJECT)

    # Ensure strain base is 0 before sweeping, and rebuild so geometry is clean.
    prj.model3d._execute_vba_code('sub main\nStoreDoubleParameter "strain", 0.0\nend sub')
    prj.model3d.full_history_rebuild()

    with open(SWEEP_MACRO, encoding="utf-8") as fh:
        macro = fh.read()
    cb.note("starting parameter sweep (5 solves) ...")
    cb.apply_macro(prj, macro, mode="execute")
    prj.save(allow_overwrite=True)
    cb.note("sweep done, reading results ...")

    # Read back per run ID, keyed by the strain value of that run.
    #
    # CRITICAL: the project also holds pre-tune solves (different serp_R) as their
    # own run IDs. Keying on strain alone and keeping "the densest trace" silently
    # pulls the stale serp_R=8.95 baseline in as the 0 % point. So we (a) restrict
    # to runs whose serp_R matches the current tuned model, and (b) among those,
    # keep the HIGHEST run ID per strain (the most recent sweep point).
    pf = cr.ProjectFile(PROJECT, allow_interactive=True)
    mod = pf.get_3d()
    # The sweep points are the most-recent runs; the max run ID is a sweep point,
    # so its serp_R is the tuned design radius. Use it as the match key.
    all_rids = sorted(mod.get_all_run_ids())
    base_R = float(mod.get_parameter_combination(all_rids[-1]).get("serp_R"))
    by_strain = {}
    for rid in all_rids:
        try:
            pc = mod.get_parameter_combination(rid)
            if abs(float(pc.get("serp_R")) - base_R) > 1e-4:
                continue  # a pre-tune / off-design run, not part of this sweep
            s = float(pc.get("strain"))
            item = mod.get_result_item(TP, rid)
            f, db = db_trace(item)
            by_strain[s] = (f, db)  # ascending rid -> last write is newest
        except Exception as exc:
            cb.note(f"  run {rid}: {exc}")

    rows = []
    base = None
    for s in sorted(by_strain):
        f, db = by_strain[s]
        d = dip_near(f, db)
        if d is None:
            rows.append({"strain": s, "error": "no dip"})
            continue
        f0, d0 = d
        if base is None:
            base = f0
        lo, hi, cov = ble_coverage(f, db, f0)
        rows.append({
            "strainPct": round(s * 100, 1),
            "f0GHz": round(f0, 4),
            "s11dB": round(d0, 2),
            "driftPct": round(100 * (f0 - base) / base, 3),
            "band": [round(lo, 3), round(hi, 3)],
            "bleCovPct": round(cov, 1),
        })

    out = {"ok": True, "project": PROJECT, "rows": rows}
    print(json.dumps(out, indent=2))
    with open(RESULT_JSON, "w") as fh:  # per-project name; don't clobber others
        json.dump(out, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
