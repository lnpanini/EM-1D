' ============================================================
' EM-1D -- Z-WAVE serpentine, FULL FEED, on-body, fully parametric.
'
' This is build-parametric.vba (the known-good flat feed: crest gap -> 2 fan-out
' stubs -> EGaIn wells -> pins -> coax shields -> 2x SSMA differential) with the
' out-of-plane z-wave added to the loop AND mirrored into the stub endpoints, and
' the connector z-stack lifted to ride on the thicker (6 mm-budget) substrate.
'
' WHY THE Z GOES INTO THE STUBS TOO
' The loop trace undulates out of plane, so the gap terminals are NOT at z = 0. If
' the stubs (and hence the ports) stayed at z = 0 the port would float in
' dielectric and S11 would read a flat ~0 dB across the whole band -- the exact
' failure the handoff warns about. So each stub starts at its loop terminal's true
' (x,y,z) and ramps to the connector plane.
'
' WHY THE Z-WAVE IS Cos HERE, NOT Sin  (this one cost a solve)
' The bare-loop model used z = z_amp*Sin(z_cyc*t), which is ODD in t. The in-plane
' curve is even in x and odd in y, so t -> -t maps the structure to (x, -y, -z):
' a C2 rotation about x, NOT a mirror. With an odd z the two gap terminals land at
' z = +0.55 and -0.55 -- one nearer the body than the other -- so ports 1 and 2
' are not equivalent, the differential mode is contaminated, and Sdd11 came out
' at only -4.3 dB (vs the -9 dB target) nearly flat across the band.
' Cos(z_cyc*t) is EVEN, so t -> -t gives (x, -y, +z): a true y = 0 mirror plane.
' Both terminals then sit at the SAME z, the stubs are exact mirror images, and
' the differential mode is clean. Phase-only change: amplitude and z-wavelength
' are untouched, so the a/lambda_z strain optimum is unaffected (it does shift
' path length slightly, hence the re-tune).
'
' Z_AMP IS COUPLED: z_amp = z_ratio * serp_R (z_ratio = 0.118117), computed inside
' the geometry block from z_ratio and serp_R. That keeps the design on its strain
' optimum (a/lambda_z ~ 0.213) automatically as serp_R is retuned for the feed --
' retune by setting serp_R ALONE; z_amp follows.
' ============================================================
Option Explicit
Sub Main
Dim h As String

On Error Resume Next
Port.Delete "1" : Port.Delete "2"
Component.Delete "component1" : Component.Delete "tissue"
Material.Delete "EGaIn" : Material.Delete "Substrate Material"
Material.Delete "Skin" : Material.Delete "Fat" : Material.Delete "Muscle"
Curve.DeleteCurve "serpcurve" : Curve.DeleteCurve "stub1" : Curve.DeleteCurve "stub2"
On Error GoTo 0

With Units
  .Geometry "mm" : .Frequency "GHz" : .Time "ns"
End With

' ---- parameters ----
StoreDoubleParameter "serp_R", 7.5
StoreDoubleParameter "amp_ratio", 0.2
StoreDoubleParameter "serp_ratio", 0.05
StoreDoubleParameter "serp_n", 12
StoreDoubleParameter "feed_gap", 1
StoreDoubleParameter "chan_r", 0.25
StoreDoubleParameter "fillet_r", 0.25
StoreDoubleParameter "z_ratio", 0.118117
StoreDoubleParameter "z_cyc", 24
StoreParameter       "z_amp", "z_ratio * serp_R"
StoreDoubleParameter "sub_h", 3.0
StoreDoubleParameter "eps_r", 2.6
StoreDoubleParameter "tand", 0.03
' pad_x must TRACK the loop, not be a fixed number. The flat design had
' pad_x 14.0 at outer_r 10.74, i.e. a 3.26 mm run from loop crest to pad. Holding
' pad_x fixed while serp_R shrinks (8.95 -> 7.66) stretched the stubs ~25 % longer
' than the proven feed, adding series inductance and feed radiation for no reason.
' pad_x itself is defined below, once outer_r exists.
StoreDoubleParameter "pad_run", 3.26
StoreDoubleParameter "pad_sep", 8.0
StoreParameter       "pad_h", "pad_sep/2"
StoreDoubleParameter "well_r", 0.9
StoreDoubleParameter "pin_r", 0.65
' THE LAND PLANE. work/gutter_check.py shows the channel rests on a parabolic
' concave ring, z = (2*z_amp/A^2)*u^2 - z_amp with u = rho - serp_R, whose RIM sits
' at z = +z_amp. That rim level is the flat "land" of the mould, and it is the
' parting surface outside the ring, so the stubs, wells and pins must all live in
' it. Previously they descended to z = 0, which dived below the parting surface --
' unmouldable, and the reposition called out during the fabrication review.
StoreParameter       "land_z", "z_amp"
StoreParameter       "pin_zb", "land_z - 0.1"
' connector rides 1 mm above the (thicker) substrate top face
StoreParameter       "pin_zt", "sub_h/2 + 1.0"
StoreParameter       "sh_ri", "1.5"
StoreParameter       "sh_ro", "2.0"
StoreParameter       "serp_A", "serp_R * amp_ratio"
StoreParameter       "outer_r", "serp_R + serp_A"
' Defined after outer_r so the expression resolves. Consumed as a quoted CST
' expression string by the wells/pins/shields history entries (that is fine for an
' expression parameter); the VBA geometry block re-derives it from doubles instead
' of calling RestoreDoubleParameter on it -- same convention as pad_h.
StoreParameter       "pad_x", "outer_r + pad_run"
StoreParameter       "sub_x", "outer_r + chan_r + 3*sub_h"
StoreParameter       "sub_y", "sub_x"
StoreParameter       "bg_space", "299.792458 / 2.44 / 8"
' phantom
StoreDoubleParameter "skin_t", 2.0
StoreDoubleParameter "fat_t", 5.0
StoreDoubleParameter "musc_t", 70.0
StoreDoubleParameter "body_gap", 1.0
StoreDoubleParameter "body_ext", 25.0
StoreParameter "z_sk_top", "-sub_h/2 - body_gap"
StoreParameter "z_sk_bot", "z_sk_top - skin_t"
StoreParameter "z_ft_bot", "z_sk_bot - fat_t"
StoreParameter "z_ms_bot", "z_ft_bot - musc_t"
StoreParameter "body_x", "sub_x + body_ext"
StoreParameter "body_y", "sub_y + body_ext"

' ---- materials ----
AddToHistory("define material EGaIn", _
  "With Material" & vbLf & ".Reset" & vbLf & ".Name ""EGaIn""" & vbLf & _
  ".FrqType ""all""" & vbLf & ".Type ""Lossy metal""" & vbLf & _
  ".SetMaterialUnit ""GHz"",""mm""" & vbLf & ".Mu ""1.0""" & vbLf & _
  ".Kappa ""3.4e+006""" & vbLf & ".Rho ""6250.0""" & vbLf & _
  ".Colour ""0.91"",""0.89"",""0.86""" & vbLf & ".Create" & vbLf & "End With")

h = "With Material" & vbLf & ".Reset" & vbLf & ".Name ""Substrate Material""" & vbLf
h = h & ".FrqType ""all""" & vbLf & ".Type ""Normal""" & vbLf & ".SetMaterialUnit ""GHz"",""mm""" & vbLf
h = h & ".Epsilon ""eps_r""" & vbLf & ".Mu ""1.0""" & vbLf & ".Kappa ""0.0""" & vbLf
h = h & ".TanD ""tand""" & vbLf & ".TanDGiven ""True""" & vbLf & ".TanDModel ""ConstTanD""" & vbLf
h = h & ".Rho ""0.0""" & vbLf
h = h & ".Colour ""0.94"",""0.82"",""0.76""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define material Substrate Material", h

h = "With Material" & vbLf & ".Reset" & vbLf & ".Name ""Skin""" & vbLf & ".Type ""Normal""" & vbLf
h = h & ".Epsilon ""38.0""" & vbLf & ".Mu ""1.0""" & vbLf & ".Sigma ""1.46""" & vbLf & ".Rho ""1109""" & vbLf
h = h & ".Transparency ""60""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define material Skin", h
h = "With Material" & vbLf & ".Reset" & vbLf & ".Name ""Fat""" & vbLf & ".Type ""Normal""" & vbLf
h = h & ".Epsilon ""5.28""" & vbLf & ".Mu ""1.0""" & vbLf & ".Sigma ""0.102""" & vbLf & ".Rho ""911""" & vbLf
h = h & ".Transparency ""60""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define material Fat", h
h = "With Material" & vbLf & ".Reset" & vbLf & ".Name ""Muscle""" & vbLf & ".Type ""Normal""" & vbLf
h = h & ".Epsilon ""52.7""" & vbLf & ".Mu ""1.0""" & vbLf & ".Sigma ""1.74""" & vbLf & ".Rho ""1090""" & vbLf
h = h & ".Transparency ""60""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define material Muscle", h

AddToHistory("new component component1", "Component.New ""component1""")
AddToHistory("new component tissue", "Component.New ""tissue""")

AddToHistory("define brick Substrate", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Substrate""" & vbLf & _
  ".Component ""component1""" & vbLf & ".Material ""Substrate Material""" & vbLf & _
  ".Xrange ""-sub_x"", ""sub_x""" & vbLf & ".Yrange ""-sub_y"", ""sub_y""" & vbLf & _
  ".Zrange ""-sub_h/2"", ""sub_h/2""" & vbLf & ".Create" & vbLf & "End With")

' ---- full EGaIn network: z-wave loop + z-ramped stubs + fillets + wells ----
h = ""
h = h & "Dim R As Double, Am As Double, Sk As Double, gp As Double, PI As Double" & vbLf
h = h & "Dim s0 As Double, dg As Double, tA As Double, tB As Double, dt As Double, tt As Double" & vbLf
h = h & "Dim uu As Double, vv As Double, ct As Double, st As Double, zz As Double" & vbLf
h = h & "Dim p1x As Double, p1y As Double, p1z As Double, p2x As Double, p2y As Double, p2z As Double" & vbLf
h = h & "Dim px As Double, ph As Double, fr As Double, zr As Double, zamp As Double" & vbLf
h = h & "Dim nU As Long, M As Long, i As Long, mzz As Long" & vbLf
h = h & "PI = 4 * Atn(1)" & vbLf
h = h & "R = RestoreDoubleParameter(""serp_R"")" & vbLf
h = h & "Am = R * RestoreDoubleParameter(""amp_ratio"")" & vbLf
h = h & "Sk = R * RestoreDoubleParameter(""serp_ratio"")" & vbLf
h = h & "nU = CLng(RestoreDoubleParameter(""serp_n""))" & vbLf
h = h & "gp = RestoreDoubleParameter(""feed_gap"")" & vbLf
' pad_x is an expression parameter, so re-derive it here from doubles rather than
' calling RestoreDoubleParameter on it (outer_r = R + Am).
h = h & "px = R + Am + RestoreDoubleParameter(""pad_run"")" & vbLf
h = h & "ph = RestoreDoubleParameter(""pad_sep"") / 2" & vbLf
h = h & "fr = RestoreDoubleParameter(""fillet_r"")" & vbLf
h = h & "zr = RestoreDoubleParameter(""z_ratio"")" & vbLf
h = h & "zamp = zr * R" & vbLf
h = h & "mzz = CLng(RestoreDoubleParameter(""z_cyc""))" & vbLf
h = h & "s0 = R + Am + 2 * Sk * nU" & vbLf
h = h & "If s0 < 0.000001 Then s0 = 0.000001" & vbLf
h = h & "dg = gp / s0 : If dg > 0.6 Then dg = 0.6" & vbLf
h = h & "tA = dg / 2 : tB = 2 * PI - dg / 2" & vbLf
h = h & "M = 16 * nU : If 12 * mzz > M Then M = 12 * mzz" & vbLf
h = h & "If M < 720 Then M = 720" & vbLf
h = h & "dt = (tB - tA) / M" & vbLf
h = h & "Curve.NewCurve ""serpcurve""" & vbLf
h = h & "With Polygon3D" & vbLf & "  .Reset" & vbLf & "  .Name ""serp3d""" & vbLf & "  .Curve ""serpcurve""" & vbLf
h = h & "  For i = 0 To M" & vbLf
h = h & "    tt = tA + dt * i" & vbLf
h = h & "    uu = R + Am * Sin(nU * tt + PI / 2) : vv = Sk * Sin(2 * nU * tt + PI)" & vbLf
h = h & "    ct = Cos(tt) : st = Sin(tt)" & vbLf
h = h & "    zz = zamp * Cos(mzz * tt)" & vbLf
h = h & "    .Point uu * ct + vv * st, uu * st - vv * ct, zz" & vbLf
h = h & "  Next i" & vbLf & "  .Create" & vbLf & "End With" & vbLf
' gap endpoints, with their true z (mirrors the trace exactly)
h = h & "uu = R + Am * Sin(nU * tA + PI / 2) : vv = Sk * Sin(2 * nU * tA + PI)" & vbLf
h = h & "ct = Cos(tA) : st = Sin(tA)" & vbLf
h = h & "p1x = uu * ct + vv * st : p1y = uu * st - vv * ct : p1z = zamp * Cos(mzz * tA)" & vbLf
h = h & "uu = R + Am * Sin(nU * tB + PI / 2) : vv = Sk * Sin(2 * nU * tB + PI)" & vbLf
h = h & "ct = Cos(tB) : st = Sin(tB)" & vbLf
h = h & "p2x = uu * ct + vv * st : p2y = uu * st - vv * ct : p2z = zamp * Cos(mzz * tB)" & vbLf
' stubs: start at the loop terminal (x,y,z), ramp to the connector plane z=0
' STUBS MUST BE FLAT ON THE LAND, so use THREE points, not two.
' The gap is 1 mm wide, so its terminals sit half a gap-arc either side of t = 0.
' t = 0 is the gutter rim (z = +z_amp = land), but 24 z-cycles means the wave has
' already fallen by t = +/-0.027 rad: the terminals land ~0.185 mm DOWN the gutter
' wall. A single straight terminal->pad line therefore ramps up through the land
' plane, leaving most of the stub BELOW the parting surface -- buried in the lower
' layer, which is exactly what moving the feed into the land plane was meant to
' prevent. So: terminal -> radially out to the rim at land height (climbing the
' last sliver of gutter wall, ~67 deg, which is the wall's own slope) -> then dead
' flat across the land to the pad.
h = h & "Dim rho1 As Double, rho2 As Double, sc1 As Double, sc2 As Double" & vbLf
h = h & "Dim orr As Double" & vbLf
h = h & "orr = R + Am" & vbLf
h = h & "rho1 = Sqr(p1x * p1x + p1y * p1y) : If rho1 < 0.000001 Then rho1 = 0.000001" & vbLf
h = h & "rho2 = Sqr(p2x * p2x + p2y * p2y) : If rho2 < 0.000001 Then rho2 = 0.000001" & vbLf
h = h & "sc1 = orr / rho1 : sc2 = orr / rho2" & vbLf
h = h & "Curve.NewCurve ""stub1""" & vbLf
h = h & "With Polygon3D" & vbLf & "  .Reset" & vbLf & "  .Name ""s1""" & vbLf & "  .Curve ""stub1""" & vbLf
h = h & "  .Point p1x, p1y, p1z" & vbLf
h = h & "  .Point p1x * sc1, p1y * sc1, zamp" & vbLf
h = h & "  .Point px, ph, zamp" & vbLf & "  .Create" & vbLf & "End With" & vbLf
h = h & "Curve.NewCurve ""stub2""" & vbLf
h = h & "With Polygon3D" & vbLf & "  .Reset" & vbLf & "  .Name ""s2""" & vbLf & "  .Curve ""stub2""" & vbLf
h = h & "  .Point p2x, p2y, p2z" & vbLf
h = h & "  .Point p2x * sc2, p2y * sc2, zamp" & vbLf
h = h & "  .Point px, -ph, zamp" & vbLf & "  .Create" & vbLf & "End With" & vbLf
' wires -> solids
h = h & "With Wire" & vbLf & "  .Reset" & vbLf & "  .Name ""Channel""" & vbLf & "  .Folder """"" & vbLf
h = h & "  .Type ""CurveWire""" & vbLf & "  .Radius ""chan_r""" & vbLf & "  .Curve ""serpcurve:serp3d""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .SolidWireModel ""True""" & vbLf & "  .Add" & vbLf & "End With" & vbLf
h = h & "With Wire" & vbLf & "  .Reset" & vbLf & "  .Name ""Stub1""" & vbLf & "  .Folder """"" & vbLf
h = h & "  .Type ""CurveWire""" & vbLf & "  .Radius ""chan_r""" & vbLf & "  .Curve ""stub1:s1""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .SolidWireModel ""True""" & vbLf & "  .Add" & vbLf & "End With" & vbLf
h = h & "With Wire" & vbLf & "  .Reset" & vbLf & "  .Name ""Stub2""" & vbLf & "  .Folder """"" & vbLf
h = h & "  .Type ""CurveWire""" & vbLf & "  .Radius ""chan_r""" & vbLf & "  .Curve ""stub2:s2""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .SolidWireModel ""True""" & vbLf & "  .Add" & vbLf & "End With" & vbLf
h = h & "With Wire" & vbLf & "  .Reset" & vbLf & "  .SolidName ""component1:ChannelSolid""" & vbLf
h = h & "  .Name ""Channel""" & vbLf & "  .KeepWire ""False""" & vbLf & "  .ConvertToSolidShape" & vbLf & "End With" & vbLf
h = h & "With Wire" & vbLf & "  .Reset" & vbLf & "  .SolidName ""component1:Stub1Solid""" & vbLf
h = h & "  .Name ""Stub1""" & vbLf & "  .KeepWire ""False""" & vbLf & "  .ConvertToSolidShape" & vbLf & "End With" & vbLf
h = h & "With Wire" & vbLf & "  .Reset" & vbLf & "  .SolidName ""component1:Stub2Solid""" & vbLf
h = h & "  .Name ""Stub2""" & vbLf & "  .KeepWire ""False""" & vbLf & "  .ConvertToSolidShape" & vbLf & "End With" & vbLf
' junction fillets at the stub/loop notch (parametric, track serp_R)
h = h & "With Sphere" & vbLf & "  .Reset" & vbLf & "  .Name ""J1""" & vbLf & "  .Component ""component1""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .Axis ""z""" & vbLf & "  .CenterRadius fr" & vbLf
h = h & "  .TopRadius 0 : .BottomRadius 0 : .Center p1x, p1y, p1z : .Segments 0 : .Create" & vbLf & "End With" & vbLf
h = h & "With Sphere" & vbLf & "  .Reset" & vbLf & "  .Name ""J2""" & vbLf & "  .Component ""component1""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .Axis ""z""" & vbLf & "  .CenterRadius fr" & vbLf
h = h & "  .TopRadius 0 : .BottomRadius 0 : .Center p2x, p2y, p2z : .Segments 0 : .Create" & vbLf & "End With" & vbLf
' wells (EGaIn columns the connector pins wet into) -- centre pin ONLY
h = h & "With Cylinder" & vbLf & "  .Reset" & vbLf & "  .Name ""Well1""" & vbLf & "  .Component ""component1""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .Axis ""z""" & vbLf & "  .Outerradius ""well_r""" & vbLf
h = h & "  .Innerradius ""0""" & vbLf & "  .Zrange ""-z_amp"", ""sub_h/2""" & vbLf
h = h & "  .Xcenter ""pad_x""" & vbLf & "  .Ycenter ""pad_h""" & vbLf & "  .Segments ""0""" & vbLf & "  .Create" & vbLf & "End With" & vbLf
h = h & "With Cylinder" & vbLf & "  .Reset" & vbLf & "  .Name ""Well2""" & vbLf & "  .Component ""component1""" & vbLf
h = h & "  .Material ""EGaIn""" & vbLf & "  .Axis ""z""" & vbLf & "  .Outerradius ""well_r""" & vbLf
h = h & "  .Innerradius ""0""" & vbLf & "  .Zrange ""-z_amp"", ""sub_h/2""" & vbLf
h = h & "  .Xcenter ""pad_x""" & vbLf & "  .Ycenter ""-pad_h""" & vbLf & "  .Segments ""0""" & vbLf & "  .Create" & vbLf & "End With" & vbLf
' union everything into ChannelSolid
h = h & "Solid.Add ""component1:ChannelSolid"", ""component1:Stub1Solid""" & vbLf
h = h & "Solid.Add ""component1:ChannelSolid"", ""component1:Stub2Solid""" & vbLf
h = h & "Solid.Add ""component1:ChannelSolid"", ""component1:J1""" & vbLf
h = h & "Solid.Add ""component1:ChannelSolid"", ""component1:J2""" & vbLf
h = h & "Solid.Add ""component1:ChannelSolid"", ""component1:Well1""" & vbLf
h = h & "Solid.Add ""component1:ChannelSolid"", ""component1:Well2""" & vbLf
AddToHistory "define EGaIn network (zwave loop+stubs+fillets+wells)", h

' ---- pins ----
AddToHistory "define pin 1", "With Cylinder" & vbLf & ".Reset" & vbLf & ".Name ""Pin1""" & vbLf & _
  ".Component ""component1""" & vbLf & ".Material ""PEC""" & vbLf & ".Axis ""z""" & vbLf & _
  ".Outerradius ""pin_r""" & vbLf & ".Innerradius ""0""" & vbLf & ".Zrange ""pin_zb"", ""pin_zt""" & vbLf & _
  ".Xcenter ""pad_x""" & vbLf & ".Ycenter ""pad_h""" & vbLf & ".Segments ""0""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define pin 2", "With Cylinder" & vbLf & ".Reset" & vbLf & ".Name ""Pin2""" & vbLf & _
  ".Component ""component1""" & vbLf & ".Material ""PEC""" & vbLf & ".Axis ""z""" & vbLf & _
  ".Outerradius ""pin_r""" & vbLf & ".Innerradius ""0""" & vbLf & ".Zrange ""pin_zb"", ""pin_zt""" & vbLf & _
  ".Xcenter ""pad_x""" & vbLf & ".Ycenter ""-pad_h""" & vbLf & ".Segments ""0""" & vbLf & ".Create" & vbLf & "End With"

' ---- coax shields + bond (give each pin a return path within 1.5 mm) ----
AddToHistory "define shield 1", "With Cylinder" & vbLf & ".Reset" & vbLf & ".Name ""Shield1""" & vbLf & _
  ".Component ""component1""" & vbLf & ".Material ""PEC""" & vbLf & ".Axis ""z""" & vbLf & _
  ".Outerradius ""sh_ro""" & vbLf & ".Innerradius ""sh_ri""" & vbLf & ".Zrange ""sub_h/2"", ""pin_zt""" & vbLf & _
  ".Xcenter ""pad_x""" & vbLf & ".Ycenter ""pad_h""" & vbLf & ".Segments ""0""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define shield 2", "With Cylinder" & vbLf & ".Reset" & vbLf & ".Name ""Shield2""" & vbLf & _
  ".Component ""component1""" & vbLf & ".Material ""PEC""" & vbLf & ".Axis ""z""" & vbLf & _
  ".Outerradius ""sh_ro""" & vbLf & ".Innerradius ""sh_ri""" & vbLf & ".Zrange ""sub_h/2"", ""pin_zt""" & vbLf & _
  ".Xcenter ""pad_x""" & vbLf & ".Ycenter ""-pad_h""" & vbLf & ".Segments ""0""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define shield bond", "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""ShieldBond""" & vbLf & _
  ".Component ""component1""" & vbLf & ".Material ""PEC""" & vbLf & _
  ".Xrange ""pad_x-0.3"", ""pad_x+0.3""" & vbLf & ".Yrange ""-(pad_h-2.0)"", ""pad_h-2.0""" & vbLf & _
  ".Zrange ""pin_zt-0.5"", ""pin_zt-0.1""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "union shields", "Solid.Add ""component1:Shield1"", ""component1:Shield2""" & vbLf & _
  "Solid.Add ""component1:Shield1"", ""component1:ShieldBond"""

' ---- phantom ----
AddToHistory("define brick Skin", "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Skin""" & vbLf & _
  ".Component ""tissue""" & vbLf & ".Material ""Skin""" & vbLf & ".Xrange ""-body_x"",""body_x""" & vbLf & _
  ".Yrange ""-body_y"",""body_y""" & vbLf & ".Zrange ""z_sk_bot"",""z_sk_top""" & vbLf & ".Create" & vbLf & "End With")
AddToHistory("define brick Fat", "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Fat""" & vbLf & _
  ".Component ""tissue""" & vbLf & ".Material ""Fat""" & vbLf & ".Xrange ""-body_x"",""body_x""" & vbLf & _
  ".Yrange ""-body_y"",""body_y""" & vbLf & ".Zrange ""z_ft_bot"",""z_sk_bot""" & vbLf & ".Create" & vbLf & "End With")
AddToHistory("define brick Muscle", "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Muscle""" & vbLf & _
  ".Component ""tissue""" & vbLf & ".Material ""Muscle""" & vbLf & ".Xrange ""-body_x"",""body_x""" & vbLf & _
  ".Yrange ""-body_y"",""body_y""" & vbLf & ".Zrange ""z_ms_bot"",""z_ft_bot""" & vbLf & ".Create" & vbLf & "End With")

' ---- 2-port differential feed (each: pin top -> shield inner, z = pin_zt) ----
AddToHistory "define port 1", "WCS.ActivateWCS ""global""" & vbLf & "With DiscretePort" & vbLf & _
  ".Reset" & vbLf & ".PortNumber ""1""" & vbLf & ".Type ""SParameter""" & vbLf & ".Impedance ""50""" & vbLf & _
  ".SetP1 ""False"", ""pad_x"", ""pad_h"", ""pin_zt""" & vbLf & _
  ".SetP2 ""False"", ""pad_x"", ""pad_h-sh_ri"", ""pin_zt""" & vbLf & _
  ".InvertDirection ""False""" & vbLf & ".Monitor ""True""" & vbLf & ".Create" & vbLf & "End With"
AddToHistory "define port 2", "WCS.ActivateWCS ""global""" & vbLf & "With DiscretePort" & vbLf & _
  ".Reset" & vbLf & ".PortNumber ""2""" & vbLf & ".Type ""SParameter""" & vbLf & ".Impedance ""50""" & vbLf & _
  ".SetP1 ""False"", ""pad_x"", ""-pad_h"", ""pin_zt""" & vbLf & _
  ".SetP2 ""False"", ""pad_x"", ""-(pad_h-sh_ri)"", ""pin_zt""" & vbLf & _
  ".InvertDirection ""False""" & vbLf & ".Monitor ""True""" & vbLf & ".Create" & vbLf & "End With"

AddToHistory("define frequency range", "Solver.FrequencyRange ""1.5"", ""3.2""")
AddToHistory("define monitor farfield (f=2.44)", "With Monitor" & vbLf & ".Reset" & vbLf & _
  ".Name ""farfield (f=2.44)""" & vbLf & ".Domain ""Frequency""" & vbLf & ".FieldType ""Farfield""" & vbLf & _
  ".MonitorValue ""2.44""" & vbLf & ".Create" & vbLf & "End With")

AddToHistory "define background", "With Background" & vbLf & ".ResetBackground" & vbLf & ".Type ""Normal""" & vbLf & _
  ".Epsilon ""1.0""" & vbLf & ".Mu ""1.0""" & vbLf & ".ApplyInAllDirections ""False""" & vbLf & _
  ".XminSpace ""bg_space""" & vbLf & ".XmaxSpace ""bg_space""" & vbLf & ".YminSpace ""bg_space""" & vbLf & _
  ".YmaxSpace ""bg_space""" & vbLf & ".ZminSpace ""bg_space""" & vbLf & ".ZmaxSpace ""bg_space""" & vbLf & "End With"

With Boundary
  .Xmin "open" : .Xmax "open" : .Ymin "open" : .Ymax "open" : .Zmin "open" : .Zmax "open"
End With

AddToHistory("set solver type", "ChangeSolverType ""HF Frequency Domain""")

End Sub
