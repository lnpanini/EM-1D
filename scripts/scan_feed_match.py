#!/usr/bin/env python3
"""Scan (sub_h, serp_R) for the best in-band differential match.

WHY A SCAN RATHER THAN MORE serp_R ITERATION
Tuning serp_R alone at sub_h = 4.0 mm is stuck near -5 dB. The impedance says why:

    flat design (proven)  Zdiff@2.44 = 68 + 52j   Im/Re = 0.76  -> -9.2 dB
    z-wave serp_R 7.662   Zdiff@2.44 = 61 + 97j   Im/Re = 1.59  -> -5.1 dB
    z-wave serp_R 7.05     Zdiff@2.44 = 31 + 36j  Im/Re = 1.16  -> -4.9 dB

serp_R trades Re against Im along a locus that never approaches 100 ohm. The
Im/Re ratio is a Q signature, and the z-wave's Q is high because its thicker
substrate holds the loop further from the body -- and in this design most of the
feed RESISTANCE comes from tissue absorption (86 % of accepted power, per
DESIGN-EVOLUTION §2d). Thinning the substrate re-couples the loop to the body,
lowers Q, and should recover the match.

sub_h cannot go to the flat design's 1.95 mm: the z-wave envelope is
2*(z_amp + chan_r) and needs cover on both faces. Hence a scan over the feasible
sub_h range, re-tuning serp_R at each.

Usage:  scan_feed_match.py <sub_h> <serp_R1> <serp_R2> ...
Each point is one solve (~4.5 min).
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
                       os.environ.get("ZW_PROJ", "zwave-feed.cst"))
BASE = "1D Results\\S-Parameters\\"
Z_RATIO = 0.118117
CHAN_R = 0.25
BLE_LO, BLE_HI = 2.400, 2.4835
MIN_COVER = float(os.environ.get("ZW_MIN_COVER", "0.25"))
LOG = os.path.join(ROOT, "work", "scan_feed_match_log.jsonl")


def db(z):
    m = abs(z)
    return 20 * math.log10(m) if m > 0 else -999.0


def log(rec):
    rec["t"] = time.strftime("%H:%M:%S")
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec) + "\n")
    cb.note(f"  [log] {json.dumps(rec)}")


def read_diff(cr, want_sub_h=None, want_serp_R=None):
    """Read Sdd11/Zdiff for the run whose PARAMETERS match what we just solved.

    Do NOT pick by `max(run_id)`. CST puts the current parameter set in run_id 0
    and pushes stored parameter combinations to higher ids, so the highest id can
    be an OLDER solve -- a re-solve at serp_R 7.5 once returned the previous 7.4
    point's impedance byte-for-byte that way. Matching on the parameter
    combination is exact and order-independent.
    """
    pf = cr.ProjectFile(PROJECT, allow_interactive=True)
    mod = pf.get_3d()
    all_rids = sorted(mod.get_all_run_ids())

    rids = all_rids
    if want_serp_R is not None:
        matched = []
        for rid in all_rids:
            try:
                pc = mod.get_parameter_combination(rid)
                if abs(float(pc.get("serp_R")) - want_serp_R) > 1e-6:
                    continue
                if want_sub_h is not None and \
                        abs(float(pc.get("sub_h")) - want_sub_h) > 1e-6:
                    continue
                matched.append(rid)
            except Exception:
                continue
        if not matched:
            raise RuntimeError(
                f"no run matches serp_R={want_serp_R}, sub_h={want_sub_h}; "
                f"available run ids {all_rids}")
        rids = matched

    def sp(name):
        for rid in rids:
            try:
                it = mod.get_result_item(BASE + name, rid)
                xs = [float(x) for x in it.get_xdata()]
                if xs:
                    return xs, [complex(y) for y in it.get_ydata()]
            except Exception:
                continue
        raise RuntimeError(f"no data for {name} in run ids {rids}")

    f, s11 = sp("S1,1")
    _, s12 = sp("S1,2")
    _, s21 = sp("S2,1")
    _, s22 = sp("S2,2")
    sdd = [(a - b - c + d) / 2 for a, b, c, d in zip(s11, s12, s21, s22)]
    zd = [100.0 * (1 + z) / (1 - z) if abs(1 - z) > 1e-12 else complex(1e9)
          for z in sdd]
    return f, sdd, zd


def sub_h_for(r, cover):
    """Minimum substrate that buries the z envelope with `cover` on each face.

    This is the RIGHT way to couple the two variables. Holding sub_h fixed while
    serp_R grows silently thins the cover (z_amp = 0.1181*serp_R), so a fixed-sub_h
    scan slides along a fabrication cliff instead of exploring the design space.
    Fixing the cover instead keeps every point equally buildable and leaves serp_R
    as the single free variable -- and that family has a genuine interior optimum,
    because a bigger serp_R needs a thicker slab, which lifts the loop off the body
    and raises Q, opposing the gain from moving the operating point.
    """
    return 2.0 * (Z_RATIO * r + CHAN_R + cover)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    # first arg: a fixed sub_h, or "auto:<cover>" to derive it per radius
    auto_cover = None
    if str(sys.argv[1]).startswith("auto:"):
        auto_cover = float(sys.argv[1].split(":", 1)[1])
        sub_h = None
    else:
        sub_h = float(sys.argv[1])
    radii = [float(a) for a in sys.argv[2:]]

    _, ci, cr = cb.load_cst(None)
    de = cb.open_environment(ci, new=False, quiet=True)
    prj, _ = cb.open_or_create_project(de, PROJECT)

    rows = []
    for r in radii:
        if auto_cover is not None:
            sub_h = round(sub_h_for(r, auto_cover), 4)
        z_amp = Z_RATIO * r
        cover = (sub_h - 2 * (z_amp + CHAN_R)) / 2
        # MIN_COVER floor is a FABRICATION limit (the wall that retains EGaIn),
        # overridable when hunting the pure-RF optimum. Keep it above ~0.05 mm
        # regardless: at zero cover the channel breaks the substrate face and is
        # no longer embedded, which changes the electromagnetics too, not just the
        # manufacturability -- so the result would stop being comparable.
        if cover < MIN_COVER:
            cb.note(f"SKIP serp_R={r}: cover {cover:.3f} mm < MIN_COVER "
                    f"{MIN_COVER} for sub_h={sub_h}")
            continue
        cb.note(f"=== sub_h={sub_h}, serp_R={r:.4f} (z_amp {z_amp:.3f}, "
                f"cover {cover:.3f}) ===")
        t0 = time.time()
        prj.model3d._execute_vba_code(
            f'sub main\n'
            f'StoreDoubleParameter "sub_h", {sub_h!r}\n'
            f'StoreDoubleParameter "serp_R", {r!r}\n'
            f'end sub')
        prj.model3d.full_history_rebuild()
        prj.model3d.run_solver()
        prj.save(allow_overwrite=True)

        f, sdd, zd = read_diff(cr, want_sub_h=sub_h, want_serp_R=r)
        i44 = min(range(len(f)), key=lambda k: abs(f[k] - 2.44))
        band = [k for k in range(len(f)) if BLE_LO <= f[k] <= BLE_HI]
        ibest = min(band, key=lambda k: db(sdd[k])) if band else i44
        worst = max(band, key=lambda k: db(sdd[k])) if band else i44
        z44 = zd[i44]
        rec = {
            "sub_h": sub_h, "serp_R": round(r, 4), "z_amp": round(z_amp, 4),
            "coverMM": round(cover, 3),
            "sdd11At244dB": round(db(sdd[i44]), 2),
            "zdiffAt244": [round(z44.real, 1), round(z44.imag, 1)],
            "imOverRe": round(z44.imag / z44.real, 3) if z44.real else None,
            "bestInBandDB": round(db(sdd[ibest]), 2),
            "worstInBandDB": round(db(sdd[worst]), 2),
            "solveSec": round(time.time() - t0),
        }
        rows.append(rec)
        log(rec)

    if rows:
        best = min(rows, key=lambda x: x["worstInBandDB"])
        print(json.dumps({"ok": True, "rows": rows, "bestByWorstInBand": best},
                         indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
