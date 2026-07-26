' ============================================================
' EM-1D add-on -- Human tissue phantom (skin / fat / muscle)
' Run this ON TOP of your tuned antenna model. It does NOT rebuild the antenna;
' it adds a 3-layer body phantom below the PDMS (-z side) so you can measure
' on-body detuning, radiation-efficiency drop, and (optionally) SAR.
'
' Tissue: dry skin / fat / muscle at 2.45 GHz (IT'IS / Gabriel database),
' as single-band lossy dielectrics -- fine for narrowband BLE.
'
' It references the antenna's existing parameters (sub_h, sub_x, sub_y), so it
' only works on a model built by the EM-1D serpentine macro.
'
' AFTER RUNNING: re-solve, then re-tune serp_R to recentre S11 on 2.44 GHz and
' read the new Radiation Efficiency. body_gap models a clothing/air gap; 0 is
' worst-case direct skin contact.
'
' *** THE RE-TUNE IS NOT OPTIONAL ***
' Efficiency read at 2.44 GHz on a model whose S11 dip sits elsewhere measures
' mismatch, not radiation, and an antenna that is electrically small at the
' readout frequency shows poor radiation efficiency in FREE SPACE too -- so an
' untuned on-body sweep cannot separate "loaded by tissue" from "wrong size".
' A 2026-07 body_gap sweep was run at serp_R = 6.3 (a ~4.4 GHz antenna) and read
' at 2.44 GHz; its ~8% radiation / ~1-6% total figures conflate the two and should
' not be quoted as the on-body result. Tune serp_R until the dip is ON 2.44 GHz
' WITH the phantom present, then read efficiency there.
' ============================================================
Option Explicit
Sub Main
Dim h As String

' ---- tissue parameters (all mm) ----
' musc_t: MUST exceed ~3x the penetration depth or the muscle/vacuum back face
' reflects and adds standing-wave dips to S11 that look like tissue resonances but
' are pure artifact. At 2.45 GHz muscle (er 52.7, sigma 1.74) has
'     delta = 1/alpha ~= 22.3 mm
' so the old 20.0 default was 0.9 delta -- ~40% of the field amplitude reached the
' back face. 70 mm ~= 3.1 delta leaves <5% amplitude (<0.3% power). If mesh cost
' bites, sweep musc_t = 20 / 40 / 70 and keep the smallest value whose S11 has
' converged, rather than guessing.
'
' body_ext: lateral margin. lambda0 = 123 mm at 2.44 GHz, so a 10 mm skirt is
' electrically tiny and the phantom edges sit in the near field. 30 mm is a
' starting point; confirm by convergence, not by assumption.
StoreDoubleParameter "skin_t", 2.0       ' skin thickness
StoreDoubleParameter "fat_t", 5.0        ' subcutaneous fat
StoreDoubleParameter "musc_t", 70.0      ' muscle -- >=3 penetration depths (see above)
StoreDoubleParameter "body_gap", 0.0     ' antenna-to-skin gap (0 = direct contact; try 1-2 = clothing)
StoreDoubleParameter "body_ext", 30.0    ' lateral margin beyond the board edge

' derived z-levels; the PDMS bottom face sits at z = -sub_h/2
StoreParameter "z_sk_top", "-sub_h/2 - body_gap"
StoreParameter "z_sk_bot", "z_sk_top - skin_t"
StoreParameter "z_ft_bot", "z_sk_bot - fat_t"
StoreParameter "z_ms_bot", "z_ft_bot - musc_t"
StoreParameter "body_x", "sub_x + body_ext"
StoreParameter "body_y", "sub_y + body_ext"

On Error Resume Next
Component.Delete "tissue"
Material.Delete "Skin"
Material.Delete "Fat"
Material.Delete "Muscle"
On Error GoTo 0
AddToHistory "new component tissue", "Component.New ""tissue"""

' ---- materials (eps_r, sigma S/m at 2.45 GHz, rho kg/m3) ----
' Rho is NOT optional if you ever want SAR. SAR is watts per kilogram, so without
' a density CST has no mass to divide by and the calculation aborts with a bare
' "SAR calculation failed" that names neither the material nor the missing field.
' Densities are IT'IS at body temperature.
h = ""
h = h & "With Material" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Skin""" & vbLf
h = h & ".Type ""Normal""" & vbLf
h = h & ".Epsilon ""38.0""" & vbLf
h = h & ".Mu ""1.0""" & vbLf
h = h & ".Sigma ""1.46""" & vbLf
h = h & ".Rho ""1109""" & vbLf
h = h & ".Colour ""0.95"",""0.75"",""0.65""" & vbLf
h = h & ".Transparency ""55""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define material Skin", h

h = ""
h = h & "With Material" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Fat""" & vbLf
h = h & ".Type ""Normal""" & vbLf
h = h & ".Epsilon ""5.28""" & vbLf
h = h & ".Mu ""1.0""" & vbLf
h = h & ".Sigma ""0.102""" & vbLf
h = h & ".Rho ""911""" & vbLf
h = h & ".Colour ""0.98"",""0.92"",""0.70""" & vbLf
h = h & ".Transparency ""55""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define material Fat", h

h = ""
h = h & "With Material" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Muscle""" & vbLf
h = h & ".Type ""Normal""" & vbLf
h = h & ".Epsilon ""52.7""" & vbLf
h = h & ".Mu ""1.0""" & vbLf
h = h & ".Sigma ""1.74""" & vbLf
h = h & ".Rho ""1090""" & vbLf
h = h & ".Colour ""0.85"",""0.45"",""0.45""" & vbLf
h = h & ".Transparency ""55""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define material Muscle", h

' ---- layers (stacked downward from the PDMS bottom face) ----
h = ""
h = h & "With Brick" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Skin""" & vbLf
h = h & ".Component ""tissue""" & vbLf
h = h & ".Material ""Skin""" & vbLf
h = h & ".Xrange ""-body_x"",""body_x""" & vbLf
h = h & ".Yrange ""-body_y"",""body_y""" & vbLf
h = h & ".Zrange ""z_sk_bot"",""z_sk_top""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define brick Skin", h

h = ""
h = h & "With Brick" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Fat""" & vbLf
h = h & ".Component ""tissue""" & vbLf
h = h & ".Material ""Fat""" & vbLf
h = h & ".Xrange ""-body_x"",""body_x""" & vbLf
h = h & ".Yrange ""-body_y"",""body_y""" & vbLf
h = h & ".Zrange ""z_ft_bot"",""z_sk_bot""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define brick Fat", h

h = ""
h = h & "With Brick" & vbLf
h = h & ".Reset" & vbLf
h = h & ".Name ""Muscle""" & vbLf
h = h & ".Component ""tissue""" & vbLf
h = h & ".Material ""Muscle""" & vbLf
h = h & ".Xrange ""-body_x"",""body_x""" & vbLf
h = h & ".Yrange ""-body_y"",""body_y""" & vbLf
h = h & ".Zrange ""z_ms_bot"",""z_ft_bot""" & vbLf
h = h & ".Create" & vbLf
h = h & "End With" & vbLf
AddToHistory "define brick Muscle", h

End Sub
