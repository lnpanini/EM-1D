#!/usr/bin/env python3
"""Export CST 1D result plots as real PNGs.

CST's Plot1D.ExportImage writes an uncompressed BMP even when the filename ends
.png, so this converts afterwards. Requires the project to be open and CST NOT
in quiet mode (quiet mode has no plot window to render).

    python scripts/export_cst_plots.py work/zwstrain85.cst deliverables/cst
"""
import os, subprocess, sys, glob

proj, outdir = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(outdir, exist_ok=True)
ITEMS = [
    (r"1D Results\S-Parameters\S1,1",                 "S11"),
    (r"1D Results\Efficiencies\Rad. Efficiency [1]",  "radiation-efficiency"),
    (r"1D Results\Efficiencies\Tot. Efficiency [1]",  "total-efficiency"),
]
tag = os.path.splitext(os.path.basename(proj))[0]
lines = ["Option Explicit", "Sub Main", "On Error Resume Next"]
for tree, name in ITEMS:
    out = os.path.join(outdir, f"{tag}-{name}.png").replace("\\", "\\")
    lines += [f'SelectTreeItem("{tree}")',
              f'Plot1D.ExportImage "{out}", 1600, 1000']
lines += ["End Sub"]
macro = "\n".join(lines)

mpath = os.path.join(os.path.dirname(proj), "_export_plots.vba")
open(mpath, "w", encoding="utf-8").write(macro)
subprocess.run([sys.executable, "scripts/cst_bridge.py", "build",
                "--project", proj, "--macro", mpath, "--mode", "execute"],
               check=False)

from PIL import Image
for f in glob.glob(os.path.join(outdir, f"{tag}-*.png")):
    try:
        Image.open(f).convert("RGB").save(f, "PNG", optimize=True)
        print("ok:", os.path.basename(f), os.path.getsize(f) // 1024, "KB")
    except Exception as e:
        print("skip:", f, e)
