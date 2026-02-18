param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$OutFile = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "_FILES_DUMP.txt")
)

$ErrorActionPreference="Stop"

$include = @("*.md","*.gs","*.js","*.json","*.ps1","*.txt")
$files = Get-ChildItem -Path $Root -Recurse -File | Where-Object {
  $name = $_.Name.ToLowerInvariant()
  ($include | ForEach-Object { $name -like $_ }) -contains $true
} | Where-Object {
  $_.FullName -notmatch "\\\.git\\"
} | Sort-Object FullName

$sb = New-Object System.Text.StringBuilder
$null = $sb.AppendLine("## TaskLess file dump  " + (Get-Date).ToString("s"))
$null = $sb.AppendLine("root: " + $Root)
$null = $sb.AppendLine("")

foreach ($f in $files) {
  $rel = $f.FullName.Substring($Root.Length).TrimStart("\")
  $null = $sb.AppendLine("==============================")
  $null = $sb.AppendLine("FILE: " + $rel)
  $null = $sb.AppendLine("==============================")
  $null = $sb.AppendLine((Get-Content -Raw -Path $f.FullName))
  $null = $sb.AppendLine("")
}

$sb.ToString() | Set-Content -Encoding UTF8 -Path $OutFile
Write-Host "Wrote: $OutFile"


