#!/usr/bin/env python3
"""Re-export a clean STEP from an already-stripped model.

Why a SECOND pass is needed: CST's STEP converter synthesises an "air_0|brick"
from the Background settings, sized from the model bounding box. Deleting the
tissue phantom and zeroing the background in the SAME macro does not help -- the
converter still uses the pre-deletion bounds, so a ~150 mm air box lands in the
file. Running the zero + export after the deletions have been applied and saved
gives the tight part-sized box.

Usage:  reexport_step.py <project.cst> <out-name.step>
"""

from __future__ import annotations

import os
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.interface as ci  # noqa: E402

ROOT = r"C:\Users\Bryan\Documents\GitHub\EM-1D"
PROJ = os.path.join(ROOT, "work", sys.argv[1])
NAME = sys.argv[2] if len(sys.argv) > 2 else "zwave-antenna.step"
OUT = os.path.join(ROOT, "work", "cad-zwave")

de = ci.DesignEnvironment.connect_to_any_or_new()
de.set_quiet_mode(True)
try:
    prj = de.get_open_project(PROJ)
except Exception:
    prj = de.open_project(PROJ)
assert os.path.normcase(prj.filename()) == os.path.normcase(PROJ), prj.filename()
print("on:", prj.filename())

target = os.path.join(OUT, NAME)
vba = f'''
sub main
On Error Resume Next
Dim fn As Integer
fn = FreeFile
Open "{os.path.join(OUT, 'reexport-log.txt')}" For Output As #fn

' The converter MATERIALISES its background as a real solid, "air_0:brick", on the
' first export -- and once it exists it can be deleted. Zeroing the Background
' settings alone does NOT shrink it (the converter keeps the earlier bounds), so
' delete the solid outright. This is why a clean STEP needs export -> delete -> export.
Err.Clear
Solid.Delete "air_0:brick"
Print #fn, "delete air_0:brick err=" & Str$(Err.Number) & " " & Err.Description

Dim i As Integer, n As Integer
n = Solid.GetNumberOfShapes
Print #fn, "shapes=" & Str$(n)
For i = 0 To n - 1
  Print #fn, "  '" & Solid.GetNameOfShapeFromIndex(i) & "'"
Next i

With Background
  .ResetBackground
  .Type "Normal"
  .Epsilon "1.0"
  .Mu "1.0"
  .ApplyInAllDirections "False"
  .XminSpace "0" : .XmaxSpace "0"
  .YminSpace "0" : .YmaxSpace "0"
  .ZminSpace "0" : .ZmaxSpace "0"
End With
With STEP
  .Reset
  .FileName "{target}"
  .ExportAttributes "True"
  .WriteAll
End With
Print #fn, "step err=" & Str$(Err.Number) & " " & Err.Description
Close #fn
end sub
'''
prj.model3d._execute_vba_code(vba)
prj.save(allow_overwrite=True)
log = os.path.join(OUT, "reexport-log.txt")
if os.path.exists(log):
    print(open(log, encoding="utf-8", errors="replace").read())
print("wrote", target, f"({os.path.getsize(target):,} bytes)")
