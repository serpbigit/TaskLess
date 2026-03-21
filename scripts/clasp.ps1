[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = "Stop"

function Resolve-ClaspCommand {
  $candidates = @()

  try {
    $cmd = Get-Command clasp -ErrorAction Stop
    if ($cmd -and $cmd.Source) {
      $candidates += $cmd.Source
    }
  } catch {}

  $appData = [Environment]::GetFolderPath("ApplicationData")
  if ($appData) {
    $candidates += (Join-Path $appData "npm\clasp.cmd")
    $candidates += (Join-Path $appData "npm\clasp.ps1")
  }

  try {
    $npmPrefix = (& npm prefix -g 2>$null | Select-Object -First 1)
    if ($npmPrefix) {
      $candidates += (Join-Path $npmPrefix "clasp.cmd")
      $candidates += (Join-Path $npmPrefix "clasp.ps1")
    }
  } catch {}

  foreach ($candidate in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Unable to find clasp. Install @google/clasp globally or update scripts\clasp.ps1 with the correct path."
}

$claspCommand = Resolve-ClaspCommand
Write-Host ("Using clasp: " + $claspCommand)

if (-not $Args -or $Args.Count -eq 0) {
  & $claspCommand
  exit $LASTEXITCODE
}

& $claspCommand @Args
exit $LASTEXITCODE
