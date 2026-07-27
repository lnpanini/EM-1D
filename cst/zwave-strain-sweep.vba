' Strain sweep with per-point result caching.
'
' CST's Parameter Sweep stores every point as its own Run ID, so all five S11
' curves end up overlaid in 1D Results and each can be selected and screenshotted
' individually -- which is the point of using the sweep rather than five manual
' solves that would each overwrite the last.
'
' 0 / 5 / 10 / 15 / 20 % uniaxial strain. The 0% point doubles as a validation
' check: it should reproduce the tuned model's 2.425 GHz.
Option Explicit
Sub Main
With ParameterSweep
  .SetSimulationType "Frequency"
  .DeleteAllSequences
  .AddSequence "strain-sweep"
  .AddParameter_ArbitraryPoints "strain-sweep", "strain", "0;0.05;0.1;0.15;0.2"
  .Start
End With
End Sub
