' ============================================================
' EM-1D -- AMC unit-cell reflection-phase design (2.44 GHz)
' Builds ONE parametric AMC unit cell: a metal patch on grounded PDMS.
'
' GOAL: find the patch size where the reflection phase crosses 0 deg at
' 2.44 GHz -- that is the AMC operating point. Larger patch -> lower frequency.
'
' This macro builds GEOMETRY + MATERIALS + PARAMETERS only. The unit-cell
' boundaries + Floquet port + solver are set BY HAND (see notes at the bottom),
' because those steps are version-specific in the CST UI and safer clicked than
' scripted.
'
' Run in a NEW, empty project (not the antenna project).
' ============================================================
Option Explicit
Sub Main
Dim h As String

' ---- parameters ----
' SIZING WARNING: the original defaults (amc_h 1.5, cell 18, patch 15) resonate at
' ~7.3 GHz, not 2.44 -- they were ~3x too small. Two independent models (half-wave
' patch, and the Sievenpiper LC sheet L=mu0*h against the patch-grid C) agree that a
' plain-PDMS cell at 2.44 GHz needs:
'
'     h = 1.5 mm -> cell 52..70 mm   (3x3 array 156..210 mm)
'     h = 3.0 mm -> cell 30..42 mm   (3x3 array  90..126 mm)
'
' Both are too large for a wearable tape, which is why a miniaturisation route
' (mushroom vias, or a higher-er ceramic-loaded layer) is required -- see
' docs/superpowers/plans/2026-07-23-amc-backed-on-body-antenna.md.
'
' The defaults below are the honest plain-PDMS baseline: they DO put the 0-deg
' crossing near 2.44 GHz, and exist to validate the model in CST before any
' miniaturisation is attempted. They are deliberately not wearable-sized.
StoreDoubleParameter "f0", 2.44
StoreDoubleParameter "eps_r", 2.68     ' PDMS
StoreDoubleParameter "tand", 0.02
StoreDoubleParameter "amc_h", 3.0      ' substrate thickness (mm) -- spacer patch->ground
StoreDoubleParameter "cell", 35.0      ' unit-cell period (mm)
StoreDoubleParameter "patch", 34.0     ' patch side (mm) -- THE variable to tune / sweep
StoreDoubleParameter "met_t", 0.035    ' patch metal thickness
StoreParameter "fmin", "f0*0.4"
StoreParameter "fmax", "f0*2.2"

On Error Resume Next
Component.Delete "amc"
Material.Delete "PDMS"
On Error GoTo 0

With Units
  .Geometry "mm" : .Frequency "GHz" : .Time "ns"
End With
AddToHistory "new component amc", "Component.New ""amc"""

' ---- PDMS substrate material ----
h = ""
h = h & "With Material" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""PDMS""" & vbLf
h = h & ".Type ""Normal""" & vbLf
h = h & ".Epsilon ""eps_r""" & vbLf
h = h & ".Mu ""1.0""" & vbLf
h = h & ".TanD ""tand""" & vbLf
h = h & ".TanDGiven ""True""" & vbLf
h = h & ".TanDModel ""ConstTanD""" & vbLf
h = h & ".Colour ""0.94"",""0.82"",""0.76""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define material PDMS", h

' ---- substrate (the ground is the Zmin 'electric' boundary -- no ground brick needed) ----
h = ""
h = h & "With Brick" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Sub""" & vbLf
h = h & ".Component ""amc""" & vbLf
h = h & ".Material ""PDMS""" & vbLf
h = h & ".Xrange ""-cell/2"",""cell/2""" & vbLf
h = h & ".Yrange ""-cell/2"",""cell/2""" & vbLf
h = h & ".Zrange ""0"",""amc_h""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define brick Sub", h

' ---- patch (PEC for the design pass; fabricated patch is EGaIn -- negligible phase change) ----
h = ""
h = h & "With Brick" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Patch""" & vbLf
h = h & ".Component ""amc""" & vbLf
h = h & ".Material ""PEC""" & vbLf
h = h & ".Xrange ""-patch/2"",""patch/2""" & vbLf
h = h & ".Yrange ""-patch/2"",""patch/2""" & vbLf
h = h & ".Zrange ""amc_h"",""amc_h + met_t""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define brick Patch", h

AddToHistory "frequency range", "Solver.FrequencyRange ""fmin"",""fmax"""

End Sub

' ============================================================
' MANUAL STEPS AFTER RUNNING (do these by hand):
'
' 1. BOUNDARIES  (Simulation > Boundaries):
'      Xmin = Xmax = "unit cell"
'      Ymin = Ymax = "unit cell"
'      Zmin = "electric (Et = 0)"      <- this IS the ground plane
'      Zmax = "open (add space)"
'
' 2. FLOQUET PORT: with unit-cell boundaries + open Zmax, CST places a Floquet
'    port at Zmax. In the Frequency Domain solver, enable Floquet ports; set the
'    scan angle theta = 0, phi = 0 (normal incidence), 2 modes (TE + TM).
'
' 3. SOLVER: Frequency Domain (it switches to the periodic/unit-cell solver
'    automatically once the boundaries are unit-cell). Start.
'
' 4. READ THE RESULT: 1D Results > S-Parameters > S1,1  ->  right-click > "Phase".
'    The frequency where the phase = 0 deg is the AMC operating frequency.
'    The useful in-phase band is roughly the +/-90 deg span around it.
'
' 5. TUNE: Parameter Sweep on `patch` (e.g. 28 .. 40 mm for the plain-PDMS
'    baseline). Larger patch pushes the 0-deg crossing DOWN in frequency. Land it
'    on 2.44 GHz. If the patch gets close to `cell`, increase `cell` too (keep a
'    gap of ~1-3 mm between patches).
'    Sanity check: if the crossing is not within ~15% of the predicted frequency,
'    stop -- the model is wrong and the sweep range cannot be trusted.
'    Also RECORD THE +/-90 deg BANDWIDTH. Skin pulls the bare loop 2.44 -> ~1.35 GHz,
'    so a narrow AMC band will mistune independently of the antenna on-body.
'
' 6. INTEGRATE: once patch/cell/amc_h give 0 deg at 2.44, build a 3x3 array of
'    that cell, place the tuned loop ~1-2 mm above it, and co-simulate on the
'    skin phantom. Expect radiation efficiency to jump from ~5-8% toward 40-70%.
' ============================================================
