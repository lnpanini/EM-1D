#!/usr/bin/env python3
"""Re-solve with farfield monitors ACROSS the band, so efficiency becomes a curve.

CST computes radiation/total efficiency only at frequencies that carry a farfield
monitor. Every project in this repo has exactly one, at 2.44 GHz, so efficiency
has only ever been a single point. This adds a comb of monitors and re-solves.

Usage:  solve_effsweep.py <project.cst> [f_lo] [f_hi] [step]
"""

from __future__ import annotations

import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import cst_bridge as cb  # noqa: E402

PROJ = os.path.join(ROOT, "work", sys.argv[1] if len(sys.argv) > 1 else "zwfree.cst")
F_LO = float(sys.argv[2]) if len(sys.argv) > 2 else 1.8
F_HI = float(sys.argv[3]) if len(sys.argv) > 3 else 3.2
STEP = float(sys.argv[4]) if len(sys.argv) > 4 else 0.1


def main():
    freqs = []
    f = F_LO
    while f <= F_HI + 1e-9:
        freqs.append(round(f, 3))
        f += STEP
    cb.note(f"{len(freqs)} farfield monitors: {freqs[0]} .. {freqs[-1]} GHz")

    _, ci, cr = cb.load_cst(None)
    de = cb.open_environment(ci, new=False, quiet=True)
    prj, _ = cb.open_or_create_project(de, PROJ)

    lines = ["sub main"]
    for fq in freqs:
        nm = f"ff{str(fq).replace('.', 'p')}"
        lines.append(
            f'AddToHistory "monitor {nm}", '
            f'"With Monitor" & vbLf & ".Reset" & vbLf & '
            f'".Name ""farfield (f={fq})""" & vbLf & '
            f'".Domain ""Frequency""" & vbLf & ".FieldType ""Farfield""" & vbLf & '
            f'".Frequency ""{fq}""" & vbLf & ".Create" & vbLf & "End With"')
    lines.append("end sub")
    prj.model3d._execute_vba_code("\n".join(lines))
    prj.save(allow_overwrite=True)

    t0 = time.time()
    prj.model3d.run_solver()
    prj.save(allow_overwrite=True)
    cb.note(f"solved in {time.time()-t0:.0f} s")

    mod = cr.ProjectFile(PROJ, allow_interactive=True).get_3d()
    out = {}
    for nm in ("Rad. Efficiency [1]", "Tot. Efficiency [1]"):
        try:
            it = mod.get_result_item("1D Results\\Efficiencies\\" + nm, 0)
            out[nm] = [[float(a), 100 * abs(complex(b))]
                       for a, b in zip(it.get_xdata(), it.get_ydata())]
        except Exception as exc:
            out[nm] = f"unavailable: {exc}"
    print(json.dumps({"ok": True, "project": PROJ, "efficiencies": out}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
