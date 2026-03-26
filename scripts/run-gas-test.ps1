[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$FunctionName,

  [Parameter(Position = 1)]
  [string]$ParamsJson = "",

  [switch]$NonDev
)

$ErrorActionPreference = "Stop"

$claspScript = Join-Path $PSScriptRoot "clasp.ps1"
if (-not (Test-Path $claspScript)) {
  throw "Missing clasp wrapper at $claspScript"
}

$args = @("run", $FunctionName)
if ($NonDev) {
  $args += "--nondev"
}
if ($ParamsJson) {
  $args += @("--params", $ParamsJson)
}

Write-Host ("Running Apps Script function: " + $FunctionName)
if ($ParamsJson) {
  Write-Host ("Params: " + $ParamsJson)
}

& $claspScript @args
exit $LASTEXITCODE
