' ============================================================
' EM-1D -- Serpentine loop, STRAIN-PARAMETRIC, on-body
' Z-WAVE serpentine (set z_amp = 0 for the flat control). Adds a `strain` parameter so uniaxial
' stretch can be swept in CST and the detuning measured directly.
'
' DEFORMATION MODEL
' Uniaxial strain along x. PDMS is near-incompressible (nu ~ 0.5), so the exact
' volume-preserving stretch ratios are
'     lam_x = 1 + strain
'     lam_y = lam_z = 1 / sqrt(1 + strain)
' The liquid-metal channel is a void in the elastomer and deforms AFFINELY with
' it (it has no stiffness of its own), so the same transform is applied to the
' trace points, the slab, the channel radius and the feed points. This is the
' assumption the whole strain argument rests on -- it is what the measurement
' should test.
'
' Predicted: perimeter grows ~5.54% at 20% strain, so f0 falls ~5.5%.
' ============================================================
Option Explicit
Sub Main
Dim h As String

On Error Resume Next
Port.Delete "1"
Monitor.Delete "farfield (f=2.44)"
Monitor.Delete "e-field (f=2.44)"
Component.Delete "component1"
Component.Delete "tissue"
Material.Delete "EGaIn"
Curve.DeleteCurve "serpcurve"
Material.Delete "Substrate Material"
Material.Delete "Skin"
Material.Delete "Fat"
Material.Delete "Muscle"
On Error GoTo 0

With Units
  .Geometry "mm" : .Frequency "GHz" : .Time "ns"
End With

' ---- Parameters ----
StoreDoubleParameter "f0", 2.44
StoreDoubleParameter "fmin", 1.5
StoreDoubleParameter "fmax", 3.5
StoreDoubleParameter "z0", 50
StoreDoubleParameter "serp_R", 8.95
StoreDoubleParameter "amp_ratio", 0.2
StoreDoubleParameter "serp_ratio", 0.05
StoreDoubleParameter "serp_n", 12
StoreDoubleParameter "feed_gap", 1
StoreDoubleParameter "chan_r", 0.25
StoreDoubleParameter "z_amp", 0.923
StoreDoubleParameter "z_cyc", 24
StoreDoubleParameter "met_t", 0.018
StoreDoubleParameter "sub_h", 4.0
StoreDoubleParameter "eps_r", 2.6
StoreDoubleParameter "tand", 0.03

' ---- THE STRAIN VARIABLE (sweep this) ----
StoreDoubleParameter "strain", 0.0
StoreParameter       "lam_x", "1 + strain"
StoreParameter       "lam_t", "1/Sqr(1 + strain)"

StoreParameter       "bg_space", "299.792458 / f0 / 8"
StoreParameter       "serp_A", "serp_R * amp_ratio"
StoreParameter       "outer_r", "serp_R + serp_A"
StoreParameter       "sub_x", "outer_r + chan_r + 3*sub_h"
StoreParameter       "sub_y", "sub_x"

' ---- tissue ----
StoreDoubleParameter "skin_t", 2.0
StoreDoubleParameter "fat_t", 5.0
StoreDoubleParameter "musc_t", 70.0
StoreDoubleParameter "body_gap", 1.0
StoreDoubleParameter "body_ext", 25.0
StoreParameter "z_sk_top", "-sub_h*lam_t/2 - body_gap"
StoreParameter "z_sk_bot", "z_sk_top - skin_t"
StoreParameter "z_ft_bot", "z_sk_bot - fat_t"
StoreParameter "z_ms_bot", "z_ft_bot - musc_t"
StoreParameter "body_x", "sub_x*lam_x + body_ext"
StoreParameter "body_y", "sub_y*lam_t + body_ext"

' ---- materials ----
AddToHistory("define material EGaIn", _
  "With Material" & vbLf & _
  ".Reset" & vbLf & ".Name ""EGaIn""" & vbLf & ".FrqType ""all""" & vbLf & _
  ".Type ""Lossy metal""" & vbLf & ".SetMaterialUnit ""GHz"",""mm""" & vbLf & _
  ".Mu ""1.0""" & vbLf & ".Kappa ""3.4e+006""" & vbLf & ".Rho ""6250.0""" & vbLf & _
  ".Colour ""0.91"",""0.89"",""0.86""" & vbLf & ".Create" & vbLf & "End With")

h = ""
h = h & "With Material" & vbLf & ".Reset" & vbLf
h = h & ".Name ""Substrate Material""" & vbLf & ".FrqType ""all""" & vbLf
h = h & ".Type ""Normal""" & vbLf & ".SetMaterialUnit ""GHz"",""mm""" & vbLf
h = h & ".Epsilon ""eps_r""" & vbLf & ".Mu ""1.0""" & vbLf & ".Kappa ""0.0""" & vbLf
h = h & ".TanD ""tand""" & vbLf & ".TanDFreq ""10.0""" & vbLf
h = h & ".TanDGiven ""True""" & vbLf & ".TanDModel ""ConstTanD""" & vbLf
h = h & ".Rho ""0.0""" & vbLf
h = h & ".Colour ""0.94"",""0.82"",""0.76""" & vbLf & ".Create" & vbLf & "End With" & vbLf
AddToHistory "define material Substrate Material", h

' Tissue: Rho is REQUIRED for SAR (W/kg). Substrate deliberately rho=0 so CST does
' not classify it as biological tissue.
h = ""
h = h & "With Material" & vbLf & ".Reset" & vbLf & ".Name ""Skin""" & vbLf
h = h & ".Type ""Normal""" & vbLf & ".Epsilon ""38.0""" & vbLf & ".Mu ""1.0""" & vbLf
h = h & ".Sigma ""1.46""" & vbLf & ".Rho ""1109""" & vbLf
h = h & ".Colour ""0.95"",""0.75"",""0.65""" & vbLf & ".Transparency ""55""" & vbLf
h = h & ".Create" & vbLf & "End With" & vbLf
AddToHistory "define material Skin", h

h = ""
h = h & "With Material" & vbLf & ".Reset" & vbLf & ".Name ""Fat""" & vbLf
h = h & ".Type ""Normal""" & vbLf & ".Epsilon ""5.28""" & vbLf & ".Mu ""1.0""" & vbLf
h = h & ".Sigma ""0.102""" & vbLf & ".Rho ""911""" & vbLf
h = h & ".Colour ""0.98"",""0.92"",""0.70""" & vbLf & ".Transparency ""55""" & vbLf
h = h & ".Create" & vbLf & "End With" & vbLf
AddToHistory "define material Fat", h

h = ""
h = h & "With Material" & vbLf & ".Reset" & vbLf & ".Name ""Muscle""" & vbLf
h = h & ".Type ""Normal""" & vbLf & ".Epsilon ""52.7""" & vbLf & ".Mu ""1.0""" & vbLf
h = h & ".Sigma ""1.74""" & vbLf & ".Rho ""1090""" & vbLf
h = h & ".Colour ""0.85"",""0.45"",""0.45""" & vbLf & ".Transparency ""55""" & vbLf
h = h & ".Create" & vbLf & "End With" & vbLf
AddToHistory "define material Muscle", h

AddToHistory("new component component1", "Component.New ""component1""")
AddToHistory("new component tissue", "Component.New ""tissue""")

' ---- strained substrate slab ----
AddToHistory("define brick Substrate", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Substrate""" & vbLf & _
  ".Component ""component1""" & vbLf & ".Material ""Substrate Material""" & vbLf & _
  ".Xrange ""-sub_x*lam_x"", ""sub_x*lam_x""" & vbLf & _
  ".Yrange ""-sub_y*lam_t"", ""sub_y*lam_t""" & vbLf & _
  ".Zrange ""-sub_h*lam_t/2"", ""sub_h*lam_t/2""" & vbLf & _
  ".Create" & vbLf & "End With")

' ---- strained serpentine channel ----
h = ""
h = h & "' Flat serpentine centreline, regenerated from parameters on every replay," & vbLf
h = h & "' then deformed affinely by the current strain." & vbLf
h = h & "'   x = (R + A sin nt) cos t + S sin 2nt sin t" & vbLf
h = h & "'   y = (R + A sin nt) sin t - S sin 2nt cos t" & vbLf
h = h & "' affine:  x *= lam_x ,  y *= lam_t   (lam_t = 1/sqrt(1+strain))" & vbLf
h = h & "Dim R As Double, Am As Double, Sk As Double, gp As Double" & vbLf
h = h & "Dim s0 As Double, dg As Double, tA As Double, tB As Double, dt As Double, tt As Double" & vbLf
h = h & "Dim uu As Double, vv As Double, ct As Double, st As Double, PI As Double" & vbLf
h = h & "Dim ex As Double, lx As Double, lt As Double, zamp As Double" & vbLf
h = h & "Dim mzz As Long" & vbLf
h = h & "Dim nU As Long, M As Long, i As Long" & vbLf
h = h & "PI = 4 * Atn(1)" & vbLf
h = h & "R   = RestoreDoubleParameter(""serp_R"")" & vbLf
h = h & "Am  = R * RestoreDoubleParameter(""amp_ratio"")" & vbLf
h = h & "Sk  = R * RestoreDoubleParameter(""serp_ratio"")" & vbLf
h = h & "nU  = CLng(RestoreDoubleParameter(""serp_n""))" & vbLf
h = h & "gp  = RestoreDoubleParameter(""feed_gap"")" & vbLf
h = h & "ex  = RestoreDoubleParameter(""strain"")" & vbLf
h = h & "lx  = 1 + ex" & vbLf
h = h & "lt  = 1 / Sqr(1 + ex)" & vbLf
h = h & "zamp = RestoreDoubleParameter(""z_amp"")" & vbLf
h = h & "mzz  = CLng(RestoreDoubleParameter(""z_cyc""))" & vbLf
h = h & "s0 = Sqr((Am * nU) * (Am * nU) + (R - 2 * nU * Sk) * (R - 2 * nU * Sk))" & vbLf
h = h & "If s0 < 0.000001 Then s0 = 0.000001" & vbLf
h = h & "dg = gp / s0" & vbLf
h = h & "If dg > 0.6 Then dg = 0.6" & vbLf
h = h & "tA = dg / 2" & vbLf
h = h & "tB = 2 * PI - dg / 2" & vbLf
h = h & "M = 16 * nU" & vbLf
h = h & "If 12 * mzz > M Then M = 12 * mzz" & vbLf
h = h & "If M < 720 Then M = 720" & vbLf
h = h & "dt = (tB - tA) / M" & vbLf
h = h & "Curve.NewCurve ""serpcurve""" & vbLf
h = h & "With Polygon3D" & vbLf
h = h & "  .Reset" & vbLf & "  .Name ""serp3d""" & vbLf & "  .Curve ""serpcurve""" & vbLf
h = h & "  For i = 0 To M" & vbLf
h = h & "    tt = tA + dt * i" & vbLf
h = h & "    uu = R + Am * Sin(nU * tt)" & vbLf
h = h & "    vv = Sk * Sin(2 * nU * tt)" & vbLf
h = h & "    ct = Cos(tt)" & vbLf
h = h & "    st = Sin(tt)" & vbLf
' NOTE: a leading "(" on a multi-argument VBA method call is a syntax error
' ("Unexpected text"), so the scale factor goes first.
h = h & "    .Point lx * (uu * ct + vv * st), lt * (uu * st - vv * ct), lt * zamp * Sin(mzz * tt)" & vbLf
h = h & "  Next i" & vbLf
h = h & "  .Create" & vbLf & "End With" & vbLf
h = h & "With Wire" & vbLf
h = h & "  .Reset" & vbLf & "  .Name ""Channel""" & vbLf & "  .Folder """"" & vbLf
h = h & "  .Type ""CurveWire""" & vbLf
h = h & "  .Radius ""chan_r*lam_t""" & vbLf
h = h & "  .Curve ""serpcurve:serp3d""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .SolidWireModel ""True""" & vbLf
h = h & "  .Add" & vbLf & "End With" & vbLf
AddToHistory "define embedded channel", h

AddToHistory("define frequency range", "Solver.FrequencyRange ""fmin"", ""fmax""")
AddToHistory("define monitor farfield (f=2.44)", _
  "With Monitor" & vbLf & ".Reset" & vbLf & ".Name ""farfield (f=2.44)""" & vbLf & _
  ".Domain ""Frequency""" & vbLf & ".FieldType ""Farfield""" & vbLf & _
  ".MonitorValue ""f0""" & vbLf & ".ExportFarfieldSource ""False""" & vbLf & _
  ".Create" & vbLf & "End With")

' ---- strained feed ----
h = ""
h = h & "Dim R As Double, Am As Double, Sk As Double, gp As Double" & vbLf
h = h & "Dim s0 As Double, dg As Double, tA As Double, tB As Double, PI As Double" & vbLf
h = h & "Dim uu As Double, vv As Double, ct As Double, st As Double" & vbLf
h = h & "Dim p1x As Double, p1y As Double, p2x As Double, p2y As Double" & vbLf
h = h & "Dim p1z As Double, p2z As Double, zamp As Double" & vbLf
h = h & "Dim mzz As Long" & vbLf
h = h & "Dim ex As Double, lx As Double, lt As Double" & vbLf
h = h & "Dim nU As Long" & vbLf
h = h & "PI = 4 * Atn(1)" & vbLf
h = h & "R   = RestoreDoubleParameter(""serp_R"")" & vbLf
h = h & "Am  = R * RestoreDoubleParameter(""amp_ratio"")" & vbLf
h = h & "Sk  = R * RestoreDoubleParameter(""serp_ratio"")" & vbLf
h = h & "nU  = CLng(RestoreDoubleParameter(""serp_n""))" & vbLf
h = h & "gp  = RestoreDoubleParameter(""feed_gap"")" & vbLf
h = h & "ex  = RestoreDoubleParameter(""strain"")" & vbLf
h = h & "lx  = 1 + ex" & vbLf
h = h & "lt  = 1 / Sqr(1 + ex)" & vbLf
h = h & "zamp = RestoreDoubleParameter(""z_amp"")" & vbLf
h = h & "mzz  = CLng(RestoreDoubleParameter(""z_cyc""))" & vbLf
h = h & "s0 = Sqr((Am * nU) * (Am * nU) + (R - 2 * nU * Sk) * (R - 2 * nU * Sk))" & vbLf
h = h & "If s0 < 0.000001 Then s0 = 0.000001" & vbLf
h = h & "dg = gp / s0" & vbLf
h = h & "If dg > 0.6 Then dg = 0.6" & vbLf
h = h & "tA = dg / 2" & vbLf
h = h & "tB = 2 * PI - dg / 2" & vbLf
h = h & "uu = R + Am * Sin(nU * tA) : vv = Sk * Sin(2 * nU * tA)" & vbLf
h = h & "ct = Cos(tA) : st = Sin(tA)" & vbLf
h = h & "p1x = (uu * ct + vv * st) * lx : p1y = (uu * st - vv * ct) * lt" & vbLf
h = h & "p1z = lt * zamp * Sin(mzz * tA)" & vbLf
h = h & "uu = R + Am * Sin(nU * tB) : vv = Sk * Sin(2 * nU * tB)" & vbLf
h = h & "ct = Cos(tB) : st = Sin(tB)" & vbLf
h = h & "p2x = (uu * ct + vv * st) * lx : p2y = (uu * st - vv * ct) * lt" & vbLf
h = h & "p2z = lt * zamp * Sin(mzz * tB)" & vbLf
h = h & "WCS.ActivateWCS ""global""" & vbLf
h = h & "With DiscretePort" & vbLf
h = h & "  .Reset" & vbLf & "  .PortNumber ""1""" & vbLf & "  .Type ""SParameter""" & vbLf
h = h & "  .Impedance ""z0""" & vbLf & "  .Voltage ""1.0""" & vbLf & "  .Current ""1.0""" & vbLf
h = h & "  .SetP1 ""False"", p1x, p1y, p1z" & vbLf
h = h & "  .SetP2 ""False"", p2x, p2y, p2z" & vbLf
h = h & "  .InvertDirection ""False""" & vbLf & "  .LocalCoordinates ""False""" & vbLf
h = h & "  .Monitor ""True""" & vbLf & "  .Radius ""0.0""" & vbLf & "  .Wire """"" & vbLf
h = h & "  .Create" & vbLf & "End With" & vbLf
AddToHistory "define discrete port 1", h

' ---- tissue phantom (flat: uniaxial stretch does not curve the body) ----
AddToHistory("define brick Skin", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Skin""" & vbLf & _
  ".Component ""tissue""" & vbLf & ".Material ""Skin""" & vbLf & _
  ".Xrange ""-body_x"",""body_x""" & vbLf & ".Yrange ""-body_y"",""body_y""" & vbLf & _
  ".Zrange ""z_sk_bot"",""z_sk_top""" & vbLf & ".Create" & vbLf & "End With")
AddToHistory("define brick Fat", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Fat""" & vbLf & _
  ".Component ""tissue""" & vbLf & ".Material ""Fat""" & vbLf & _
  ".Xrange ""-body_x"",""body_x""" & vbLf & ".Yrange ""-body_y"",""body_y""" & vbLf & _
  ".Zrange ""z_ft_bot"",""z_sk_bot""" & vbLf & ".Create" & vbLf & "End With")
AddToHistory("define brick Muscle", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Muscle""" & vbLf & _
  ".Component ""tissue""" & vbLf & ".Material ""Muscle""" & vbLf & _
  ".Xrange ""-body_x"",""body_x""" & vbLf & ".Yrange ""-body_y"",""body_y""" & vbLf & _
  ".Zrange ""z_ms_bot"",""z_ft_bot""" & vbLf & ".Create" & vbLf & "End With")

' ---- background, boundaries, solver ----
h = ""
h = h & "With Background" & vbLf & "  .ResetBackground" & vbLf & "  .Type ""Normal""" & vbLf
h = h & "  .Epsilon ""1.0""" & vbLf & "  .Mu ""1.0""" & vbLf
h = h & "  .ApplyInAllDirections ""False""" & vbLf
h = h & "  .XminSpace ""bg_space""" & vbLf & "  .XmaxSpace ""bg_space""" & vbLf
h = h & "  .YminSpace ""bg_space""" & vbLf & "  .YmaxSpace ""bg_space""" & vbLf
h = h & "  .ZminSpace ""bg_space""" & vbLf & "  .ZmaxSpace ""bg_space""" & vbLf
h = h & "End With" & vbLf
AddToHistory "define background", h

With Boundary
  .Xmin "open" : .Xmax "open" : .Ymin "open" : .Ymax "open" : .Zmin "open" : .Zmax "open"
End With

AddToHistory("set solver type", "ChangeSolverType ""HF Frequency Domain""")

End Sub
