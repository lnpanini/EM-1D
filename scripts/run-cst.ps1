<#
.SYNOPSIS
  Run an EM-1D CST export (or any CST project) through CST Studio Suite from the command line.

.DESCRIPTION
  Thin wrapper around "CST DESIGN ENVIRONMENT.exe". EM-1D exports a VBA macro
  (Sub Main ... End Sub) that builds the antenna and sets the solver span; this
  script feeds that macro to CST with -m, and can also run the solver with -r.

.PARAMETER Path
  Path to the file to run: a macro (.bas/.vba, run with -m) or a project (.cst).

.PARAMETER Solver
  Also run the solver (adds -r). For a .cst project this runs its configured solver.

.PARAMETER Gpu
  Number of GPUs to use (adds -withgpu=N). Omit for CPU.

.PARAMETER CstExe
  Override the CST executable path. By default the newest install that actually
  contains "CST DESIGN ENVIRONMENT.exe" is used -- note that a version folder can
  exist while holding only licence-manager leftovers, so presence of the folder
  is not enough to go on.

.EXAMPLE
  .\scripts\run-cst.ps1 -Path .\rect-2.45GHz-cst.bas

.EXAMPLE
  .\scripts\run-cst.ps1 -Path .\patch.cst -Solver -Gpu 1

.NOTES
  This is fire-and-forget: it hands the macro to CST and returns. To build,
  solve and read S-parameters back as JSON, use scripts/cst_bridge.py instead.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [switch]$Solver,
  [int]$Gpu = 0,
  [string]$CstExe
)

if (-not $CstExe) {
  $CstExe = Get-ChildItem "C:\Program Files\CST Studio Suite 20*", "C:\Program Files (x86)\CST Studio Suite 20*" `
      -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "CST DESIGN ENVIRONMENT.exe" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
}
if (-not $CstExe) {
  Write-Error "No CST install containing 'CST DESIGN ENVIRONMENT.exe' was found.`nPass -CstExe with the correct path."
  exit 1
}
if (-not (Test-Path $CstExe)) {
  Write-Error "CST executable not found: $CstExe`nPass -CstExe with the correct path."
  exit 1
}
if (-not (Test-Path $Path)) {
  Write-Error "Input file not found: $Path"
  exit 1
}

$full = (Resolve-Path $Path).Path
$ext = [System.IO.Path]::GetExtension($full).ToLower()

# Build argument list. -m runs a macro; for a raw .cst project we just open/run it.
$cstArgs = @()
if ($ext -eq ".bas" -or $ext -eq ".vba") { $cstArgs += "-m" }
if ($Solver) { $cstArgs += "-r" }
if ($Gpu -gt 0) { $cstArgs += "-withgpu=$Gpu" }
$cstArgs += $full

Write-Host "Running: `"$CstExe`" $($cstArgs -join ' ')" -ForegroundColor Cyan
& $CstExe @cstArgs
exit $LASTEXITCODE
