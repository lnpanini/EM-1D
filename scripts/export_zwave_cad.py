#!/usr/bin/env python3
"""Export fabrication CAD for the tuned z-wave design.

Outputs (work/cad-zwave/):
  zwave-antenna.step        full assembly (substrate + channel network), for CAD
  zwave-channel-master.stl  the CHANNEL VOLUME solid -- print this as the raised
                            positive on the resin master
  zwave-substrate.stl       the slab, defines the cast envelope

WHAT THIS SOLID IS, AND IS NOT
It is the channel volume: the geometry to print as the mould's raised POSITIVE.
It is NOT a sacrificial/dissolvable core -- an earlier design conversation
described one and that is out of date (DESIGN-EVOLUTION §7). Both roles happen to
need the same solid, which is why the older flat file was still usable; only the
label was wrong. Naming it "-master" here so the file itself says what it is.

Z-WAVE SPECIFIC: the channel undulates +/- z_amp out of plane, so unlike the flat
design this master is NOT a planar groove. It is castable because the process is a
3D-printed resin master with a FLEXIBLE elastomer cast -- the part flexes on
demould. Whether a 0.5 mm channel undulating this far actually releases cleanly is
still unconfirmed on a real print; that is the open fabrication question.

Runs on a Save-As COPY so the solved model keeps its results. prj.save(other_path)
writes a copy but leaves the session attached to the ORIGINAL, so the copy is
re-opened and asserted before any destructive edit -- doing otherwise deleted a
solved project's results once.
"""

from __future__ import annotations

import os
import sys

sys.path.append(r"C:\Program Files (x86)\CST Studio Suite 2024\AMD64\python_cst_libraries")
import cst.interface as ci  # noqa: E402

ROOT = r"C:\Users\Bryan\Documents\GitHub\EM-1D"
SRC = os.path.join(ROOT, "work",
                   sys.argv[1] if len(sys.argv) > 1 else "zwave-feed3.cst")
COPY = os.path.join(ROOT, "work",
                    sys.argv[2] if len(sys.argv) > 2 else "zwave-fab-export.cst")
OUT = os.path.join(ROOT, "work", "cad-zwave")

os.makedirs(OUT, exist_ok=True)

de = ci.DesignEnvironment.connect_to_any_or_new()
de.set_quiet_mode(True)
try:
    prj = de.get_open_project(SRC)
except Exception:
    prj = de.open_project(SRC)

prj.save(COPY, include_results=False, allow_overwrite=True)
prj.close()
prj = de.open_project(COPY)
assert os.path.normcase(prj.filename()) == os.path.normcase(COPY), (
    f"refusing to edit: session is on {prj.filename()}, not the copy"
)
print("editing copy:", prj.filename())

vba = r'''
sub main
Dim fn As Integer
fn = FreeFile
Open "{out}\export-log.txt" For Output As #fn

On Error Resume Next

' Zero the background padding, else the STEP converter emits an "air_0|brick"
' box that dwarfs the part (caught on the first export).
Err.Clear
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
Print #fn, "background_zeroed err=" & Str$(Err.Number) & " " & Err.Description

' Simulation-only parts are not manufactured: the phantom, the connector pins and
' the coax shields (those are the SSMA connector, bought not printed), and ports.
Err.Clear
Port.Delete "1"
Port.Delete "2"
Print #fn, "delete_ports err=" & Str$(Err.Number) & " " & Err.Description
Err.Clear
Component.Delete "tissue"
Print #fn, "delete_tissue err=" & Str$(Err.Number) & " " & Err.Description
Err.Clear
Solid.Delete "component1:Pin1"
Solid.Delete "component1:Pin2"
Solid.Delete "component1:Shield1"
Print #fn, "delete_connector err=" & Str$(Err.Number) & " " & Err.Description

Dim i As Integer, n As Integer
n = Solid.GetNumberOfShapes
Print #fn, "shapes_remaining=" & Str$(n)
For i = 0 To n - 1
  Print #fn, "  shape='" & Solid.GetNameOfShapeFromIndex(i) & "'"
Next i

' --- STEP: full assembly ---
Err.Clear
With STEP
  .Reset
  .FileName "{out}\zwave-antenna.step"
  .ExportAttributes "True"
  .WriteAll
End With
Print #fn, "step err=" & Str$(Err.Number) & " " & Err.Description

' --- STL: the channel volume = raised positive for the resin master ---
Err.Clear
With STL
  .Reset
  .FileName "{out}\zwave-channel-master.stl"
  .Name "ChannelSolid"
  .Component "component1"
  .ExportFileUnits "mm"
  .Write
End With
Print #fn, "stl_channel err=" & Str$(Err.Number) & " " & Err.Description

' --- STL: substrate slab (cast envelope) ---
Err.Clear
With STL
  .Reset
  .FileName "{out}\zwave-substrate.stl"
  .Name "Substrate"
  .Component "component1"
  .ExportFileUnits "mm"
  .Write
End With
Print #fn, "stl_substrate err=" & Str$(Err.Number) & " " & Err.Description

Close #fn
end sub
'''.replace("{out}", OUT)

prj.model3d._execute_vba_code(vba)
prj.save(allow_overwrite=True)

print("\n--- export log ---")
log = os.path.join(OUT, "export-log.txt")
if os.path.exists(log):
    print(open(log, encoding="utf-8", errors="replace").read())

print("--- files ---")
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(f"  {f}  {os.path.getsize(p):,} bytes")
