' ============================================================
' EM-1D -- Z-WAVE casting mould (outer cavity tool)
'
' WHY THIS SHAPE OF TOOL, AND NOT A TWO-PART GROOVE MOULD
' work/mold_parting_check.py proves no FLAT parting plane can form this channel.
' The centreline undulates +/-0.886 mm but the channel radius is only 0.25 mm, so
' the best flat plane (z = -0.70) cuts just 33 % of the loop; the other 67 % ends
' up fully enclosed inside one half as a floating island with no draw direction.
' That also rules out ZWAVE-HANDOFF's "preferred" option (wave offset entirely
' above the bond plane + flat cap) -- a groove must be open along its WHOLE length.
'
' So the z-wave channel is formed by a SACRIFICIAL CORE, not by a groove:
'   1. print the channel volume (deliverables/zwave-channel-master.stl) in a
'      dissolvable/meltable resin or wax
'   2. locate it in this open cavity on the core seats
'   3. cast Ecoflex around it, cure
'   4. dissolve/melt the core out through the two connector wells
'   5. inject EGaIn through the same wells, fit 2x SSMA
' The wells are the access ports for both core removal and EGaIn fill, which is
' what makes a fully-buried non-planar channel practical here.
'
' The alternative -- the "half-donut" layout, where the channel lies on a true
' toroidal surface so the parting surface can follow it -- needs z_cyc = serp_n
' and quadrature phasing; see ZWAVE-MOLD-NOTES.md. That is a different antenna and
' would need re-tuning, so it is NOT what this tool is for.
'
' Everything is parametric off the antenna model, so re-running this after the
' feed is repositioned regenerates the tool.
' ============================================================
Option Explicit
Sub Main
Dim h As String

On Error Resume Next
Component.Delete "mould"
Material.Delete "ToolResin"
On Error GoTo 0

With Units
  .Geometry "mm" : .Frequency "GHz" : .Time "ns"
End With

' ---- tool parameters ----
StoreDoubleParameter "wall_t", 4.0        ' cavity wall thickness
StoreDoubleParameter "floor_t", 3.0       ' cavity floor thickness
StoreDoubleParameter "draft_cl", 0.10     ' clearance so the cast part releases
StoreDoubleParameter "align_r", 1.5       ' corner alignment pin radius
StoreDoubleParameter "align_h", 3.0       ' alignment pin height above the rim
StoreDoubleParameter "spout_w", 3.0       ' pour spout / vent notch width

' cavity inner size = the cast part + release clearance
StoreParameter "cav_x", "sub_x + draft_cl"
StoreParameter "cav_y", "sub_y + draft_cl"
StoreParameter "cav_z", "sub_h"
StoreParameter "out_x", "cav_x + wall_t"
StoreParameter "out_y", "cav_y + wall_t"
' cavity floor sits at z = -sub_h/2 (the part's underside); tool base below it
StoreParameter "z_bot", "-sub_h/2 - floor_t"
StoreParameter "z_rim", "sub_h/2"

AddToHistory("new component mould", "Component.New ""mould""")

' A distinct material so the tool is obvious in CAD and never confused with the
' antenna. Not used for any simulation -- this component is geometry only.
AddToHistory("define material ToolResin", _
  "With Material" & vbLf & ".Reset" & vbLf & ".Name ""ToolResin""" & vbLf & _
  ".FrqType ""all""" & vbLf & ".Type ""Normal""" & vbLf & _
  ".Epsilon ""3.0""" & vbLf & ".Mu ""1.0""" & vbLf & ".Rho ""0.0""" & vbLf & _
  ".Colour ""0.45"",""0.55"",""0.70""" & vbLf & ".Transparency ""45""" & vbLf & _
  ".Create" & vbLf & "End With")

' ---- 1. outer tool block ----
AddToHistory("define brick MouldBody", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""MouldBody""" & vbLf & _
  ".Component ""mould""" & vbLf & ".Material ""ToolResin""" & vbLf & _
  ".Xrange ""-out_x"", ""out_x""" & vbLf & _
  ".Yrange ""-out_y"", ""out_y""" & vbLf & _
  ".Zrange ""z_bot"", ""z_rim""" & vbLf & _
  ".Create" & vbLf & "End With")

' ---- 2. hollow out the casting cavity (open top) ----
AddToHistory("define brick Cavity", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Cavity""" & vbLf & _
  ".Component ""mould""" & vbLf & ".Material ""ToolResin""" & vbLf & _
  ".Xrange ""-cav_x"", ""cav_x""" & vbLf & _
  ".Yrange ""-cav_y"", ""cav_y""" & vbLf & _
  ".Zrange ""-sub_h/2"", ""z_rim+1""" & vbLf & _
  ".Create" & vbLf & "End With")
AddToHistory("subtract cavity", _
  "Solid.Subtract ""mould:MouldBody"", ""mould:Cavity""")

' ---- 3. first-pour level scribe, INSTEAD of core support posts ----
' NO posts hold the core. That is deliberate: any support touching the core
' leaves a hole from the part's outer face straight into the channel once the
' core is dissolved, and a leak path is the one failure this design cannot
' afford -- EGaIn escaping under stretch (DESIGN-EVOLUTION §7). A first attempt
' at this tool had four floor posts AND two well risers; both would have vented
' the channel to the outside, and the posts were additionally at r = 0.55*serp_R,
' inside the loop, touching nothing at all.
'
' The core is located by a TWO-POUR process instead:
'   pour 1  fill to this scribe line = the channel's lowest point, z = -(z_amp+chan_r)
'   cure to tacky, lay the core on it (it beds into the soft surface, self-locating)
'   pour 2  fill to the rim, burying the core
' The scribe is a shallow groove around the cavity wall so the first pour can be
' judged by eye rather than by volume.
h = ""
h = h & "Dim zr1 As Double, sc As Double" & vbLf
h = h & "zr1 = -(RestoreDoubleParameter(""z_ratio"") * RestoreDoubleParameter(""serp_R"")"
h = h & " + RestoreDoubleParameter(""chan_r""))" & vbLf
h = h & "sc = 0.25" & vbLf
' A thin frame subtracted from the wall: outer ring minus inner ring, so it cuts
' only the wall face and never breaks through to the outside of the tool.
h = h & "With Brick" & vbLf
h = h & "  .Reset" & vbLf & "  .Name ""ScribeOuter""" & vbLf
h = h & "  .Component ""mould""" & vbLf & "  .Material ""ToolResin""" & vbLf
h = h & "  .Xrange -(RestoreDoubleParameter(""sub_x"") + 0.6), "
h = h & "RestoreDoubleParameter(""sub_x"") + 0.6" & vbLf
h = h & "  .Yrange -(RestoreDoubleParameter(""sub_y"") + 0.6), "
h = h & "RestoreDoubleParameter(""sub_y"") + 0.6" & vbLf
h = h & "  .Zrange zr1 - sc / 2, zr1 + sc / 2" & vbLf
h = h & "  .Create" & vbLf & "End With" & vbLf
h = h & "With Brick" & vbLf
h = h & "  .Reset" & vbLf & "  .Name ""ScribeInner""" & vbLf
h = h & "  .Component ""mould""" & vbLf & "  .Material ""ToolResin""" & vbLf
h = h & "  .Xrange -RestoreDoubleParameter(""sub_x""), RestoreDoubleParameter(""sub_x"")" & vbLf
h = h & "  .Yrange -RestoreDoubleParameter(""sub_y""), RestoreDoubleParameter(""sub_y"")" & vbLf
h = h & "  .Zrange zr1 - sc, zr1 + sc" & vbLf
h = h & "  .Create" & vbLf & "End With" & vbLf
h = h & "Solid.Subtract ""mould:ScribeOuter"", ""mould:ScribeInner""" & vbLf
h = h & "Solid.Subtract ""mould:MouldBody"", ""mould:ScribeOuter""" & vbLf
AddToHistory "cut first-pour scribe line", h

' ---- 5. corner alignment pins for the flat lid ----
h = ""
h = h & "Dim j As Integer, ax As Double, ay As Double, ar As Double" & vbLf
h = h & "Dim ox As Double, oy As Double, zr As Double, ah As Double" & vbLf
h = h & "ar = RestoreDoubleParameter(""align_r"")" & vbLf
h = h & "ah = RestoreDoubleParameter(""align_h"")" & vbLf
h = h & "ox = RestoreDoubleParameter(""sub_x"") + RestoreDoubleParameter(""draft_cl"")"
h = h & " + RestoreDoubleParameter(""wall_t"") / 2" & vbLf
h = h & "oy = RestoreDoubleParameter(""sub_y"") + RestoreDoubleParameter(""draft_cl"")"
h = h & " + RestoreDoubleParameter(""wall_t"") / 2" & vbLf
h = h & "zr = RestoreDoubleParameter(""sub_h"") / 2" & vbLf
h = h & "For j = 0 To 3" & vbLf
h = h & "  If j = 0 Then ax = ox : ay = oy" & vbLf
h = h & "  If j = 1 Then ax = -ox : ay = oy" & vbLf
h = h & "  If j = 2 Then ax = -ox : ay = -oy" & vbLf
h = h & "  If j = 3 Then ax = ox : ay = -oy" & vbLf
h = h & "  With Cylinder" & vbLf
h = h & "    .Reset" & vbLf
h = h & "    .Name ""Align"" & CStr(j)" & vbLf
h = h & "    .Component ""mould""" & vbLf
h = h & "    .Material ""ToolResin""" & vbLf
h = h & "    .Axis ""z""" & vbLf
h = h & "    .Outerradius ar" & vbLf
h = h & "    .Innerradius ""0""" & vbLf
h = h & "    .Zrange zr, zr + ah" & vbLf
h = h & "    .Xcenter ax" & vbLf
h = h & "    .Ycenter ay" & vbLf
h = h & "    .Segments ""0""" & vbLf
h = h & "    .Create" & vbLf
h = h & "  End With" & vbLf
h = h & "  Solid.Add ""mould:MouldBody"", ""mould:Align"" & CStr(j)" & vbLf
h = h & "Next j" & vbLf
AddToHistory "add alignment pins", h

' ---- 6. pour spout / vent notch in one wall ----
AddToHistory("define brick Spout", _
  "With Brick" & vbLf & ".Reset" & vbLf & ".Name ""Spout""" & vbLf & _
  ".Component ""mould""" & vbLf & ".Material ""ToolResin""" & vbLf & _
  ".Xrange ""-spout_w/2"", ""spout_w/2""" & vbLf & _
  ".Yrange ""cav_y-0.01"", ""out_y+0.01""" & vbLf & _
  ".Zrange ""sub_h/2-1.2"", ""z_rim+0.01""" & vbLf & _
  ".Create" & vbLf & "End With")
AddToHistory("cut spout", _
  "Solid.Subtract ""mould:MouldBody"", ""mould:Spout""")

End Sub
