#!/usr/bin/env python3
"""Build the strain-parametric bare-loop model at a given geometry and sweep it.

Usage:  run_strain_at.py <project.cst> <serp_R> <z_amp> <sub_h>
        (z_amp = 0 builds the FLAT control at the same substrate)

Why the bare-loop model and not the fed one: `serp-zwave-feed.vba` has no strain
parameterisation (the stubs, wells, pins, shields and phantom would all have to be
deformed too). Both existing drift numbers -- the z-wave's -6.7 % and the flat
control's -11.5 % -- were measured on this bare-loop delta-gap model, so re-running
here keeps the comparison apples-to-apples instead of mixing model families.

The geometry parameters are set with StoreDoubleParameter, which is NOT a history
entry in this macro, so they survive the rebuild the sweep performs.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import cst_bridge as cb  # noqa: E402

PROJ_NAME = sys.argv[1]
SERP_R = float(sys.argv[2])
Z_AMP = float(sys.argv[3])
SUB_H = float(sys.argv[4])
PROJECT = os.path.join(ROOT, "work", PROJ_NAME)
MACRO = os.path.join(ROOT, "cst", "serp-zwave.vba")

print(f"=== {PROJ_NAME}: serp_R {SERP_R}, z_amp {Z_AMP}, sub_h {SUB_H} ===")

_, ci, cr = cb.load_cst(None)
de = cb.open_environment(ci, new=False, quiet=True)
prj, created = cb.open_or_create_project(de, PROJECT)

with open(MACRO, encoding="utf-8") as fh:
    cb.apply_macro(prj, fh.read())

prj.model3d._execute_vba_code(
    f'sub main\n'
    f'StoreDoubleParameter "serp_R", {SERP_R!r}\n'
    f'StoreDoubleParameter "z_amp", {Z_AMP!r}\n'
    f'StoreDoubleParameter "z_cyc", 24\n'
    f'StoreDoubleParameter "sub_h", {SUB_H!r}\n'
    f'StoreDoubleParameter "strain", 0.0\n'
    f'end sub')
prj.model3d.full_history_rebuild()
prj.save(allow_overwrite=True)
print("built; handing off to run_strain_sweep.py")

# run_strain_sweep.py does: strain=0, rebuild, ParameterSweep.Start, then reads
# each run's resonance keyed by its own parameter combination.
r = subprocess.run(
    [sys.executable, os.path.join(ROOT, "scripts", "run_strain_sweep.py"), PROJ_NAME],
    cwd=ROOT)
sys.exit(r.returncode)
