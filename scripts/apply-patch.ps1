param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$FromClipboard,
  [string]$PatchFile,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Read-PatchText {
  if ($PatchFile) { return (Get-Content -Raw -Path $PatchFile) }
  if ($FromClipboard) { return (Get-Clipboard -Raw) }
  throw "Provide -FromClipboard or -PatchFile <path>"
}

function Normalize-RelPath([string]$p) {
  $p = ($p ?? "").Trim()
  if (-not $p) { throw "Empty file path in patch bundle." }
  $p = $p -replace "/","\"
  if ($p.StartsWith("\")) { $p = $p.TrimStart("\") }
  if ($p -match "^\w:\") { throw "Patch path must be repo-relative, got absolute: $p" }
  if ($p -match "\.\.") { throw "Patch path may not contain .. : $p" }
  return $p
}

$txt = Read-PatchText

# Patch bundle format:
# <<<FILE relative\path.ext>>>
# <full file contents...>
# <<<END>>>
$re = [regex]'(?s)<<<FILE\s+([^\r\n>]+)\s*>>>(.*?)<<<END>>>'
$matches = $re.Matches($txt)

if ($matches.Count -eq 0) {
  throw "No files found. Expected blocks like: <<<FILE path>>> ... <<<END>>>"
}

$plan = @()
foreach ($m in $matches) {
  $rel = Normalize-RelPath $m.Groups[1].Value
  $content = $m.Groups[2].Value

  # Preserve exact content, but remove one leading newline if present (common formatting artifact)
  if ($content.StartsWith("`r`n")) { $content = $content.Substring(2) }
  elseif ($content.StartsWith("`n")) { $content = $content.Substring(1) }

  $abs = Join-Path $RepoRoot $rel
  $dir = Split-Path -Parent $abs
  $plan += [pscustomobject]@{ Rel=$rel; Abs=$abs; Dir=$dir; Bytes=([Text.Encoding]::UTF8.GetByteCount($content)); Content=$content }
}

# Safety: ensure all target files are under repo root
$repoFull = (Resolve-Path $RepoRoot).Path.TrimEnd("\")
foreach ($p in $plan) {
  $absFull = (Resolve-Path -LiteralPath $p.Dir -ErrorAction SilentlyContinue)
  if (-not $absFull) { } # dir may not exist yet
  $target = [IO.Path]::GetFullPath($p.Abs)
  if (-not ($target.StartsWith($repoFull + "\", [System.StringComparison]::OrdinalIgnoreCase) -or $target -eq $repoFull)) {
    throw "Unsafe target outside repo root: $($p.Rel) => $target"
  }
}

Write-Host "Patch plan ($($plan.Count) files) against repo: $RepoRoot"
$plan | Select-Object Rel,Bytes | Format-Table -AutoSize | Out-String | Write-Host

if ($DryRun) {
  Write-Host "DryRun: no files written."
  exit 0
}

foreach ($p in $plan) {
  if (!(Test-Path -LiteralPath $p.Dir)) { New-Item -ItemType Directory -Path $p.Dir -Force | Out-Null }
  Set-Content -LiteralPath $p.Abs -Value $p.Content -Encoding UTF8
}

Write-Host "Patch applied."

