param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$TreeDepth = 4,
  [int]$MaxFileChars = 12000
)

$ErrorActionPreference="Stop"

function SafeRead([string]$path, [int]$limit) {
  if (!(Test-Path -LiteralPath $path)) { return "[MISSING] $path" }
  $t = Get-Content -Raw -LiteralPath $path
  if ($t.Length -le $limit) { return $t }
  return $t.Substring(0,$limit) + "`r`n...[TRUNCATED]..."
}

$git = ""
try { $git = (git rev-parse HEAD 2>$null).Trim() } catch { $git = "[no-git]" }

$tree = ""
try {
  # limited depth tree (fast)
  $tree = (Get-ChildItem -LiteralPath $Root -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\\.git\\" -and $_.FullName -notmatch "\\node_modules\\" } |
    ForEach-Object {
      $rel = $_.FullName.Substring($Root.Length).TrimStart("\")
      $depth = ($rel -split "\\").Count - 1
      if ($depth -le $TreeDepth) { $rel }
    } |
    Sort-Object |
    Out-String).Trim()
} catch {
  $tree = "[tree failed] " + $_.Exception.Message
}

$filesDump = Join-Path $Root "_FILES_DUMP.txt"
$dumpHint = if (Test-Path -LiteralPath $filesDump) { "Exists: $filesDump" } else { "Missing: $filesDump (run scripts\dump-files.ps1)" }

$statePath  = Join-Path $Root "STATE.md"
$tasksPath  = Join-Path $Root "DEV_TASKS.md"
$logicPath  = Join-Path $Root "BUSINESS_LOGIC.md"
$schemaPath = Join-Path $Root "SCHEMA.json"

$pack = @()
$pack += "===== TASKLESS PACK ====="
$pack += ("Generated: " + (Get-Date).ToString("s"))
$pack += ("RepoRoot: " + $Root)
$pack += ("GitHead: " + $git)
$pack += ""
$pack += "----- TREE (depth " + $TreeDepth + ") -----"
$pack += $tree
$pack += ""
$pack += "----- KEY FILES (truncated) -----"
$pack += "## STATE.md"
$pack += (SafeRead $statePath $MaxFileChars)
$pack += ""
$pack += "## DEV_TASKS.md"
$pack += (SafeRead $tasksPath $MaxFileChars)
$pack += ""
$pack += "## BUSINESS_LOGIC.md"
$pack += (SafeRead $logicPath $MaxFileChars)
$pack += ""
$pack += "## SCHEMA.json"
$pack += (SafeRead $schemaPath $MaxFileChars)
$pack += ""
$pack += "----- FILE DUMP -----"
$pack += $dumpHint
$pack += "TIP: paste _FILES_DUMP.txt separately only if needed (it can be huge)."
$pack += ""
$pack += "----- NEXT DEBUG HOOKS (GAS) -----"
$pack += "Run in Apps Script editor (when utilities exist):"
$pack += "- TL_Code_Inventory()"
$pack += "- TL_Sheets_ExportSchemaJson()"
$pack += "- TL_Sheets_ListTabsAndHeaders()"
$pack += ""
$pack += "===== END PACK ====="

($pack -join "`r`n") | Set-Clipboard
Write-Host "PACK copied to clipboard."
